/**
 * Testes da API contra um servidor HTTP real, em porta efêmera.
 *
 * Um mock do servidor testaria o roteador, não a API. Como o objetivo aqui é
 * garantir que os endpoints de saúde funcionem de verdade, o servidor sobe.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

import { createApiServer, type ReadinessState } from '../apps/api/src/server.js';
import { loadConfig } from '../packages/shared/src/config.js';
import { createLogger } from '../packages/shared/src/logger.js';
import { createDefaultRegistry } from '../packages/domain/src/actions.js';
import { createMockAdapterSet } from '../packages/integrations/src/adapters/mock.js';

const logger = createLogger({ level: 'error', service: 'test', sink: () => {} });

let baseUrl = '';
let readiness: ReadinessState;
let close: () => Promise<void>;

before(async () => {
  const config = loadConfig({ SERVICE_NAME: 'control-plane-test', PORT: '0' });
  const built = createApiServer({
    config,
    logger,
    registry: createDefaultRegistry(createMockAdapterSet()),
    env: { N8N_API_KEY: 'valor-que-nao-deve-vazar' },
  });

  readiness = built.readiness;

  await new Promise<void>((resolve) => built.server.listen(0, '127.0.0.1', resolve));
  const address = built.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  close = () =>
    new Promise<void>((resolve, reject) =>
      built.server.close((err) => (err ? reject(err) : resolve())),
    );
});

after(async () => {
  await close();
});

describe('GET /health', () => {
  it('responde 200 com o serviço vivo', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body['status'], 'ok');
    assert.equal(body['service'], 'control-plane-test');
    assert.equal(typeof body['uptimeSeconds'], 'number');
  });
});

describe('GET /ready', () => {
  it('responde 200 quando pronto', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as Record<string, unknown>)['status'], 'ready');
  });

  it('responde 503 quando não está pronto', async () => {
    readiness.ready = false;
    readiness.reason = 'teste';

    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 503);

    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body['status'], 'not_ready');
    assert.equal(body['reason'], 'teste');

    readiness.ready = true;
    readiness.reason = 'inicializado';
  });
});

describe('GET /status', () => {
  it('reporta o kill switch acionado por padrão', async () => {
    const res = await fetch(`${baseUrl}/status`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      posture: { killSwitch: string; executionMode: string; requireHumanApproval: boolean };
    };

    assert.equal(body.posture.killSwitch, 'engaged');
    assert.equal(body.posture.executionMode, 'dry-run');
    assert.equal(body.posture.requireHumanApproval, true);
  });

  it('nunca expõe valor de credencial', async () => {
    const raw = await (await fetch(`${baseUrl}/status`)).text();

    assert.doesNotMatch(raw, /valor-que-nao-deve-vazar/);
    assert.match(raw, /"credentialConfigured": true/);
  });

  it('lista as ações registradas com a classificação de mutação', async () => {
    const body = (await (await fetch(`${baseUrl}/status`)).json()) as {
      actions: { total: number; mutating: number; kinds: { kind: string; mutating: boolean }[] };
    };

    assert.ok(body.actions.total > 0);
    assert.ok(body.actions.mutating > 0);

    const restart = body.actions.kinds.find((k) => k.kind === 'vps.container.restart');
    assert.equal(restart?.mutating, true);

    const list = body.actions.kinds.find((k) => k.kind === 'vps.containers.list');
    assert.equal(list?.mutating, false);
  });
});

describe('roteamento', () => {
  it('responde 404 em rota desconhecida', async () => {
    const res = await fetch(`${baseUrl}/nao-existe`);
    assert.equal(res.status, 404);
    assert.deepEqual(((await res.json()) as Record<string, unknown>)['available'], [
      '/health',
      '/ready',
      '/status',
    ]);
  });

  it('recusa métodos que não sejam GET', async () => {
    const res = await fetch(`${baseUrl}/health`, { method: 'POST' });
    assert.equal(res.status, 405);
  });

  it('ignora query string ao resolver a rota', async () => {
    const res = await fetch(`${baseUrl}/health?verbose=1`);
    assert.equal(res.status, 200);
  });
});
