/**
 * Teste da rota HTTP do webhook, contra um servidor real em porta efêmera.
 *
 * Usa as fixtures no formato da Evolution API v2 — não o formato simplificado
 * da primeira versão, que não correspondia a nada real.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';

import { handleWhatsAppWebhook } from '../../apps/api/src/routes/whatsapp/webhook.js';
import { createWhatsAppModule } from '../../packages/integrations/src/evolution/index.js';
import { ActionExecutor } from '../../packages/domain/src/executor.js';
import { createDefaultRegistry } from '../../packages/domain/src/actions.js';
import { createMockAdapterSet } from '../../packages/integrations/src/adapters/mock.js';
import { createKillSwitch } from '../../packages/security/src/kill-switch.js';
import { createDenyAllApprovalProvider } from '../../packages/security/src/approval.js';
import { createMemoryAuditProvider } from '../../packages/audit/src/audit.js';
import { createLogger } from '../../packages/shared/src/logger.js';

import {
  textMessage,
  ownMessage,
  groupMessage,
  connectionUpdate,
  imageWithoutCaption,
  ALLOWED_NUMBER,
  FOREIGN_JID,
} from './fixtures/evolution-payloads.js';

const secret = 'webhook-secret-de-teste'; // pragma: allowlist-secret
const silentLogger = createLogger({ level: 'error', service: 'test', sink: () => {} });

let server: Server;
let baseUrl: string;

before(async () => {
  const executor = new ActionExecutor({
    registry: createDefaultRegistry(createMockAdapterSet()),
    killSwitch: createKillSwitch({ engaged: true }),
    approval: createDenyAllApprovalProvider(),
    audit: createMemoryAuditProvider(),
    logger: silentLogger,
    dryRun: true,
  });

  const module = createWhatsAppModule({
    allowedNumbers: [ALLOWED_NUMBER],
    rateLimitPerMinute: 100,
    executor,
    logger: silentLogger,
    githubOwner: 'dadocruz',
  });

  server = createServer((req, res) => {
    handleWhatsAppWebhook(req, res, { module, webhookSecret: secret, logger: silentLogger }).catch(() => {
      res.writeHead(500).end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function sign(body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function post(payload: unknown, options: { signed?: boolean; rawBody?: string } = {}) {
  const body = options.rawBody ?? JSON.stringify(payload);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.signed !== false) headers['x-webhook-signature'] = sign(body);
  return fetch(`${baseUrl}/`, { method: 'POST', headers, body });
}

describe('POST /whatsapp/webhook — caminho feliz', () => {
  it('aceita mensagem de texto valida de numero autorizado', async () => {
    const res = await post(textMessage({ id: 'route-ok-1' }));
    assert.equal(res.status, 200);

    const json = (await res.json()) as {
      received: boolean;
      writeActionsEnabled: boolean;
      responsePreview: string | null;
    };
    assert.equal(json.received, true);
    assert.equal(json.writeActionsEnabled, false);
    assert.match(json.responsePreview ?? '', /Comandos disponíveis/);
  });
});

describe('POST /whatsapp/webhook — assinatura', () => {
  it('rejeita assinatura ausente com 401', async () => {
    const res = await post(textMessage({ id: 'route-nosig' }), { signed: false });
    assert.equal(res.status, 401);
  });

  it('rejeita assinatura incorreta com 401', async () => {
    const body = JSON.stringify(textMessage({ id: 'route-badsig' }));
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-signature': 'sha256=' + 'a'.repeat(64) },
      body,
    });
    assert.equal(res.status, 401);
  });

  it('rejeita corpo alterado apos a assinatura', async () => {
    const original = JSON.stringify(textMessage({ id: 'route-tamper' }));
    const tampered = JSON.stringify(textMessage({ id: 'route-tamper', text: 'outro comando' }));
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-signature': sign(original) },
      body: tampered,
    });
    assert.equal(res.status, 401);
  });
});

describe('POST /whatsapp/webhook — corpo', () => {
  it('rejeita JSON invalido com 400', async () => {
    const res = await post(null, { rawBody: 'isto nao e json' });
    assert.equal(res.status, 400);
  });

  it('rejeita payload acima do limite com 413 e explica o motivo', async () => {
    // Limite da rota é 64 KB. Um comando de texto nunca precisa disso.
    // O 413 precisa CHEGAR ao cliente: a primeira versão destruía o socket
    // antes de responder, e o cliente via erro de conexão sem saber a causa.
    const huge = 'x'.repeat(70 * 1024);
    const res = await post(null, { rawBody: huge });
    assert.equal(res.status, 413);
    assert.equal(((await res.json()) as { error: string }).error, 'too_large');
  });
});

describe('POST /whatsapp/webhook — eventos descartados', () => {
  // Todos respondem 200: são tráfego NORMAL da Evolution. Responder 4xx faria
  // a Evolution reenfileirar indefinidamente algo que nunca será aceito.

  it('mensagem do proprio numero e descartada como from_self', async () => {
    const res = await post(ownMessage());
    assert.equal(res.status, 200);
    const json = (await res.json()) as { processed: boolean; reason: string };
    assert.equal(json.processed, false);
    assert.equal(json.reason, 'from_self');
  });

  it('mensagem de grupo e descartada', async () => {
    const res = await post(groupMessage());
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { reason: string }).reason, 'group_message');
  });

  it('connection.update e descartado', async () => {
    const res = await post(connectionUpdate());
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { reason: string }).reason, 'not_a_message_event');
  });

  it('imagem sem texto e descartada', async () => {
    const res = await post(imageWithoutCaption());
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { reason: string }).reason, 'no_text_content');
  });
});

describe('POST /whatsapp/webhook — allowlist e deduplicacao', () => {
  it('numero fora da allowlist nao recebe resposta', async () => {
    const res = await post(textMessage({ jid: FOREIGN_JID, id: 'route-foreign' }));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { responsePreview: string | null }).responsePreview, null);
  });

  it('mensagem duplicada nao e processada duas vezes', async () => {
    const payload = textMessage({ id: 'route-dup-fixed' });
    const first = (await (await post(payload)).json()) as { responsePreview: string | null };
    const second = (await (await post(payload)).json()) as { responsePreview: string | null };

    assert.ok(first.responsePreview !== null, 'a primeira deveria ter sido processada');
    assert.equal(second.responsePreview, null, 'a segunda deveria ter sido ignorada');
  });
});

describe('POST /whatsapp/webhook — vazamento', () => {
  it('nunca expoe o numero completo na resposta', async () => {
    const raw = await (await post(textMessage({ id: 'route-leak' }))).text();
    assert.doesNotMatch(raw, new RegExp(ALLOWED_NUMBER));
  });
});
