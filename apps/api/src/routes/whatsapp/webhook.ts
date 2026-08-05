/**
 * Rota do webhook do WhatsApp (Evolution API).
 *
 * MÓDULO EM HOMOLOGAÇÃO. Esta rota só RECEBE eventos e responde com texto
 * dentro da própria requisição de teste (`respondWithText` no payload de
 * retorno) — não há chamada de saída para enviar mensagem via Evolution API
 * nesta fase. Ligar o envio de volta ao WhatsApp real é trabalho futuro,
 * explicitamente fora desta rota.
 *
 * Sequência de validação, na ordem que barata-para-cara:
 *   1. assinatura do webhook (HMAC) — rejeita forjamento antes de tudo
 *   2. corpo bem formado
 *   3. allowlist + rate limit + deduplicação (dentro do módulo)
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WhatsAppModule } from '../../../../../packages/integrations/src/evolution/index.js';
import { verifyWebhookSignature } from '../../../../../packages/integrations/src/evolution/webhook-auth.js';
import { maskPhone } from '../../../../../packages/integrations/src/evolution/types.js';
import type { Logger } from '../../../../../packages/shared/src/logger.js';

export interface WhatsAppRouteDependencies {
  readonly module: WhatsAppModule;
  readonly webhookSecret: string;
  readonly logger: Logger;
}

const MAX_BODY_BYTES = 64 * 1024; // um comando de texto não precisa de mais que isso

async function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
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

  const raw = await readBody(req);
  if (raw === null) {
    json(res, 413, { error: 'payload_too_large_or_unreadable', correlationId });
    return;
  }

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

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    json(res, 400, { error: 'invalid_json', correlationId });
    return;
  }

  const from = typeof body['from'] === 'string' ? body['from'] : '';
  const text = typeof body['text'] === 'string' ? body['text'] : '';
  const messageId = typeof body['messageId'] === 'string' ? body['messageId'] : correlationId;

  if (!from || !text) {
    json(res, 400, { error: 'missing_fields', correlationId });
    return;
  }

  const response = await module.processIncoming(
    { from, body: text, messageId, receivedAt: new Date().toISOString() },
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
