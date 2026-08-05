/**
 * Teste da rota HTTP do webhook, contra um servidor real em porta efêmera.
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
    allowedNumbers: ['5511999999999'],
    rateLimitPerMinute: 30,
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

describe('POST /whatsapp/webhook', () => {
  it('aceita evento com assinatura valida e numero autorizado', async () => {
    const body = JSON.stringify({ from: '5511999999999', text: 'ajuda', messageId: 'w1' });
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-signature': sign(body) },
      body,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { received: boolean; writeActionsEnabled: boolean };
    assert.equal(json.received, true);
    assert.equal(json.writeActionsEnabled, false);
  });

  it('rejeita assinatura ausente com 401', async () => {
    const body = JSON.stringify({ from: '5511999999999', text: 'ajuda', messageId: 'w2' });
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    assert.equal(res.status, 401);
  });

  it('rejeita assinatura incorreta com 401', async () => {
    const body = JSON.stringify({ from: '5511999999999', text: 'ajuda', messageId: 'w3' });
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-signature': 'sha256=' + 'a'.repeat(64) },
      body,
    });
    assert.equal(res.status, 401);
  });

  it('rejeita JSON invalido mesmo com assinatura valida', async () => {
    const body = 'isto nao e json';
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-signature': sign(body) },
      body,
    });
    assert.equal(res.status, 400);
  });

  it('rejeita corpo sem campos obrigatorios', async () => {
    const body = JSON.stringify({ from: '5511999999999' }); // sem 'text'
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-signature': sign(body) },
      body,
    });
    assert.equal(res.status, 400);
  });

  it('numero fora da allowlist recebe 200 mas sem preview de resposta', async () => {
    const body = JSON.stringify({ from: '5511000000000', text: 'ajuda', messageId: 'w4' });
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-signature': sign(body) },
      body,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { responsePreview: string | null };
    assert.equal(json.responsePreview, null);
  });

  it('nunca expoe o numero completo na resposta', async () => {
    const body = JSON.stringify({ from: '5511999999999', text: 'ajuda', messageId: 'w5' });
    const raw = await (
      await fetch(`${baseUrl}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-signature': sign(body) },
        body,
      })
    ).text();
    assert.doesNotMatch(raw, /5511999999999/);
  });
});
