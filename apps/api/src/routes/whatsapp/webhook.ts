/**
 * Rota do webhook do WhatsApp (Evolution API).
 *
 * MÓDULO EM HOMOLOGAÇÃO. Esta rota só RECEBE eventos e responde no corpo da
 * própria resposta HTTP — não há chamada de saída para entregar mensagem via
 * Evolution API nesta fase.
 *
 * Sequência de validação, do portão mais barato ao mais caro:
 *   1. assinatura HMAC — rejeita forjamento antes de gastar parsing
 *   2. JSON válido
 *   3. normalização do payload da Evolution: descarta `fromMe` (loop),
 *      grupo, broadcast, evento que não é mensagem, e mensagem sem texto
 *   4. allowlist + deduplicação + rate limit (dentro do módulo)
 *
 * ## Sobre a assinatura HMAC — leia antes de conectar número real
 *
 * O header `x-webhook-signature` **é uma convenção deste projeto, não um
 * recurso nativo da Evolution API.** A Evolution v2 não assina o corpo do
 * webhook com HMAC; ela envia a própria `apikey` dentro do payload, o que é
 * um mecanismo mais fraco (o segredo trafega no corpo e vaza em qualquer log
 * de requisição).
 *
 * Para que esta verificação funcione com a instância real, uma destas
 * precisa ser verdade:
 *   - um proxy reverso à frente calcula o HMAC e injeta o header; ou
 *   - a validação passa a usar o campo `apikey` do corpo (mais fraco); ou
 *   - a Evolution é atualizada para uma versão com assinatura nativa.
 *
 * Enquanto nada disso estiver decidido, a rota funciona para homologação
 * controlada — e **não** deve receber tráfego de uma instância real.
 * Ver `docs/runbooks/whatsapp-homologation.md`.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WhatsAppModule } from '../../../../../packages/integrations/src/evolution/index.js';
import { verifyWebhookSignature } from '../../../../../packages/integrations/src/evolution/webhook-auth.js';
import { normalizeEvolutionWebhook } from '../../../../../packages/integrations/src/evolution/normalize.js';
import { maskPhone } from '../../../../../packages/integrations/src/evolution/types.js';
import type { Logger } from '../../../../../packages/shared/src/logger.js';

export interface WhatsAppRouteDependencies {
  readonly module: WhatsAppModule;
  readonly webhookSecret: string;
  readonly logger: Logger;
}

const MAX_BODY_BYTES = 64 * 1024; // um comando de texto não precisa de mais que isso

type BodyResult =
  | { readonly ok: true; readonly raw: string }
  | { readonly ok: false; readonly reason: 'too_large' | 'stream_error' };

/**
 * Lê o corpo com teto de tamanho.
 *
 * Ao estourar o limite, **para de acumular mas não destrói o socket**. A
 * primeira versão chamava `req.destroy()` ali, o que matava a conexão antes
 * de o 413 sair — o cliente recebia erro de socket em vez do status, e não
 * tinha como saber que o motivo foi tamanho. Agora o handler responde 413 com
 * `Connection: close`, e o Node encerra depois de a resposta ser enviada.
 */
async function readBody(req: IncomingMessage): Promise<BodyResult> {
  return new Promise((resolve) => {
    let size = 0;
    let settled = false;
    const chunks: Buffer[] = [];

    const settle = (result: BodyResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Para de consumir sem derrubar a conexão: a resposta ainda precisa sair.
        req.pause();
        settle({ ok: false, reason: 'too_large' });
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => settle({ ok: true, raw: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', () => settle({ ok: false, reason: 'stream_error' }));
    req.on('aborted', () => settle({ ok: false, reason: 'stream_error' }));
  });
}

function json(res: ServerResponse, status: number, body: unknown, closeConnection = false): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...(closeConnection ? { connection: 'close' } : {}),
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

export async function handleWhatsAppWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  deps: WhatsAppRouteDependencies,
): Promise<void> {
  const correlationId = randomUUID();
  const { module, webhookSecret, logger } = deps;

  const bodyResult = await readBody(req);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === 'too_large' ? 413 : 400;
    logger.warn('whatsapp: corpo rejeitado', { reason: bodyResult.reason, correlationId });
    // `Connection: close` porque o restante do corpo nunca será consumido —
    // manter a conexão viva deixaria bytes órfãos no buffer.
    json(res, status, { error: bodyResult.reason, correlationId }, true);
    return;
  }
  const raw = bodyResult.raw;

  const signatureHeader = req.headers['x-webhook-signature'];
  const verification = verifyWebhookSignature(
    raw,
    typeof signatureHeader === 'string' ? signatureHeader : undefined,
    webhookSecret,
  );

  if (!verification.valid) {
    logger.warn('whatsapp: webhook rejeitado', { reason: verification.reason, correlationId });
    json(res, 401, { error: 'invalid_signature', correlationId });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    json(res, 400, { error: 'invalid_json', correlationId });
    return;
  }

  const normalized = normalizeEvolutionWebhook(body);

  // Recusa aqui não é erro: `connection.update`, mensagem de grupo e eco do
  // próprio número são tráfego normal da Evolution. Respondemos 200 para que
  // ela não reenfileire o evento — o que aconteceria com 4xx e geraria
  // retentativa infinita de algo que nunca será aceito.
  if (!normalized.accepted) {
    logger.info('whatsapp: evento descartado na normalizacao', {
      reason: normalized.reason,
      instance: normalized.instance,
      correlationId,
    });
    json(res, 200, {
      received: true,
      processed: false,
      reason: normalized.reason,
      correlationId,
      writeActionsEnabled: module.writeActionsEnabled,
      responsePreview: null,
    });
    return;
  }

  const from = normalized.from as string;
  const response = await module.processIncoming(
    {
      from,
      body: normalized.text as string,
      messageId: normalized.messageId as string,
      receivedAt: new Date().toISOString(),
    },
    correlationId,
  );

  logger.info('whatsapp: webhook processado', {
    maskedFrom: maskPhone(from),
    ok: response.ok,
    correlationId,
  });

  // A resposta HTTP aqui é para o QUEM CHAMOU o webhook (teste, ou a própria
  // Evolution API confirmando recebimento) — não é o envio da mensagem de
  // volta ao usuário do WhatsApp. Esse envio está desligado nesta fase.
  json(res, 200, {
    received: true,
    correlationId,
    writeActionsEnabled: module.writeActionsEnabled,
    responsePreview: response.ok ? response.text : null,
  });
}
