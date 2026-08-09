import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createN8nReadAdapter } from '../../packages/integrations/src/n8n/adapter.js';
import {
  N8nReadClient,
  N8nReadError,
  describeN8nCredential,
  loadN8nApiKey,
} from '../../packages/integrations/src/n8n/client.js';

describe('credencial n8n', () => {
  it('carrega arquivo protegido sem expor o valor no status', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'n8n-key-'));
    const path = join(dir, 'api-key');
    try {
      await writeFile(path, 'segredo-de-teste\n', { mode: 0o600 });
      await chmod(path, 0o600);

      const env = { N8N_API_KEY_PATH: path };
      assert.equal(await loadN8nApiKey({ env }), 'segredo-de-teste');

      const status = await describeN8nCredential({ env });
      assert.equal(status.configured, true);
      assert.equal(status.source, 'protected_file');
      assert.equal(status.fileMode, '600');
      assert.doesNotMatch(JSON.stringify(status), /segredo-de-teste/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('falha fechado quando a chave não existe', async () => {
    await assert.rejects(
      loadN8nApiKey({
        env: { N8N_API_KEY_PATH: '/caminho/inexistente/chave' },
        defaultKeyPath: '/outro/caminho/inexistente',
      }),
      /não configurada/,
    );
  });
});

describe('cliente n8n somente leitura', () => {
  it('pagina somente com GET e descarta campos sensíveis da resposta', async () => {
    const calls: Array<{ url: string; method: string; key: string }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        method: init?.method ?? 'GET',
        key: headers.get('X-N8N-API-KEY') ?? '',
      });
      const secondPage = url.includes('cursor=pagina-2');
      return new Response(
        JSON.stringify({
          data: [
            {
              id: secondPage ? 'wf-2' : 'wf-1',
              name: secondPage ? 'Segundo fluxo' : 'Fluxo Garbo',
              active: !secondPage,
              isArchived: secondPage,
              createdAt: '2026-08-01T00:00:00Z',
              updatedAt: '2026-08-09T00:00:00Z',
              tags: [],
              nodes: [
                {
                  type: 'n8n-nodes-base.httpRequest',
                  parameters: { authorization: 'segredo-que-nao-pode-sair' },
                  credentials: { httpHeaderAuth: { id: 'credencial-secreta' } },
                },
              ],
              connections: { segredo: true },
              pinData: { segredo: true },
              staticData: { segredo: true },
            },
          ],
          nextCursor: secondPage ? null : 'pagina-2',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const client = new N8nReadClient({
      baseUrl: 'https://n8n.test/',
      apiKey: 'chave-de-teste',
      fetchImpl: fakeFetch,
    });
    const workflows = await client.listWorkflows();

    assert.equal(workflows.length, 2);
    assert.equal(workflows[1]?.isArchived, true);
    assert.ok(workflows.every((workflow) => workflow.clientSlug === null));
    assert.ok(workflows.every((workflow) => workflow.clientConfidence === 'unknown'));
    assert.ok(calls.every((call) => call.method === 'GET'));
    assert.ok(calls.every((call) => call.key === 'chave-de-teste'));
    assert.ok(calls.every((call) => !call.url.includes('chave-de-teste')));
    const serialized = JSON.stringify(workflows);
    assert.doesNotMatch(serialized, /segredo-que-nao-pode-sair|credencial-secreta|pinData|staticData/);
  });

  it('não inclui o corpo potencialmente sensível no erro', async () => {
    const client = new N8nReadClient({
      baseUrl: 'https://n8n.test',
      apiKey: 'chave-de-teste',
      fetchImpl: async () =>
        new Response(JSON.stringify({ message: 'token-interno-que-nao-pode-vazar' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    });

    await assert.rejects(
      client.listWorkflows(),
      (error: unknown) =>
        error instanceof N8nReadError &&
        error.status === 403 &&
        !error.message.includes('token-interno-que-nao-pode-vazar'),
    );
  });

  it('recusa id inválido antes da rede', async () => {
    let called = false;
    const client = new N8nReadClient({
      baseUrl: 'https://n8n.test',
      apiKey: 'teste',
      fetchImpl: async () => {
        called = true;
        return new Response('{}', { status: 200 });
      },
    });
    await assert.rejects(client.getWorkflow('../credentials'), /inválido/);
    assert.equal(called, false);
  });

  it('adaptador não infere cliente e não expõe escrita', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'wf-1',
              name: 'Fluxo Garbo',
              active: true,
              isArchived: false,
              updatedAt: '2026-08-09T00:00:00Z',
              nodes: [],
              tags: [],
            },
          ],
          nextCursor: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const adapter = createN8nReadAdapter(
      new N8nReadClient({ baseUrl: 'https://n8n.test', apiKey: 'teste', fetchImpl: fakeFetch }),
    );

    assert.deepEqual(await adapter.listWorkflows(), [
      {
        id: 'wf-1',
        name: 'Fluxo Garbo',
        active: true,
        isArchived: false,
        updatedAt: '2026-08-09T00:00:00Z',
        clientSlug: null,
      },
    ]);
    assert.equal('createWorkflow' in adapter, false);
    assert.equal('updateWorkflow' in adapter, false);
    assert.equal('deleteWorkflow' in adapter, false);
    assert.equal('activateWorkflow' in adapter, false);
  });

  it('falha explicitamente quando a API não oferece GET de credenciais', async () => {
    const client = new N8nReadClient({
      baseUrl: 'https://n8n.test',
      apiKey: 'teste',
      fetchImpl: async () => new Response('', { status: 405 }),
    });
    await assert.rejects(
      client.listCredentialNames(),
      (error: unknown) => error instanceof N8nReadError && error.status === 405,
    );
  });
});
