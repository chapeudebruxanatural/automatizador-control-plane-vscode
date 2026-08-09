import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CloudflareReadClient,
  CloudflareReadError,
  describeCloudflareCredential,
  loadCloudflareApiToken,
} from '../../packages/integrations/src/cloudflare/client.js';
import { createCloudflareReadAdapter } from '../../packages/integrations/src/cloudflare/adapter.js';

describe('credencial Cloudflare', () => {
  it('carrega arquivo protegido sem expor o valor no status', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cf-token-'));
    const path = join(dir, 'api-token');
    try {
      await writeFile(path, 'segredo-de-teste\n', { mode: 0o600 });
      await chmod(path, 0o600);

      const env = { CLOUDFLARE_API_TOKEN_PATH: path };
      assert.equal(await loadCloudflareApiToken({ env }), 'segredo-de-teste');

      const status = await describeCloudflareCredential({ env });
      assert.equal(status.configured, true);
      assert.equal(status.source, 'protected_file');
      assert.equal(status.fileMode, '600');
      assert.doesNotMatch(JSON.stringify(status), /segredo-de-teste/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('falha fechado quando o caminho declarado não existe', async () => {
    await assert.rejects(
      loadCloudflareApiToken({
        env: { CLOUDFLARE_API_TOKEN_PATH: '/caminho/inexistente/token' },
        defaultTokenPath: '/outro/caminho/inexistente',
      }),
      /não configurado/,
    );
  });
});

describe('cliente Cloudflare somente leitura', () => {
  it('usa apenas GET e envia o token somente no cabeçalho', async () => {
    const calls: Array<{ url: string; method: string; authorization: string }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        authorization: headers.get('Authorization') ?? '',
      });
      return new Response(JSON.stringify({ success: true, result: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const client = new CloudflareReadClient({
      accountId: 'conta-1',
      token: 'token-de-teste',
      baseUrl: 'https://cloudflare.test',
      fetchImpl: fakeFetch,
    });

    await Promise.all([
      client.listZones(),
      client.listDnsRecords('zona-1'),
      client.listPagesProjects(),
      client.listWorkerScripts(),
      client.listWorkerDomains(),
      client.listTunnels(),
    ]);

    assert.equal(calls.length, 6);
    assert.ok(calls.every((call) => call.method === 'GET'));
    assert.ok(calls.every((call) => call.authorization === 'Bearer token-de-teste'));
    assert.ok(calls.every((call) => !call.url.includes('token-de-teste')));
  });

  it('não inclui corpo de erro potencialmente sensível na exceção', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ success: false, errors: [{ message: 'valor-sensível' }] }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    const client = new CloudflareReadClient({
      accountId: 'conta-1',
      token: 'token-de-teste',
      fetchImpl: fakeFetch,
    });

    await assert.rejects(
      client.listZones(),
      (error: unknown) =>
        error instanceof CloudflareReadError &&
        error.status === 403 &&
        !error.message.includes('valor-sensível'),
    );
  });

  it('adaptador expõe só metadados e nenhum método de escrita', async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const isDns = String(input).includes('/dns_records');
      return new Response(
        JSON.stringify({
          success: true,
          result: isDns
            ? [{ id: 'dns-1', type: 'TXT', name: '_segredo.exemplo.com', content: 'nao-vazar', proxied: false }]
            : [{ id: 'zone-1', name: 'exemplo.com', status: 'active' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const adapter = createCloudflareReadAdapter(
      new CloudflareReadClient({ accountId: 'conta-1', token: 'teste', fetchImpl: fakeFetch }),
    );

    assert.deepEqual(await adapter.listZones(), [
      { id: 'zone-1', name: 'exemplo.com', status: 'active' },
    ]);
    const dns = await adapter.listDnsRecords('zone-1');
    assert.deepEqual(dns, [
      { id: 'dns-1', type: 'TXT', name: '_segredo.exemplo.com', proxied: false },
    ]);
    assert.doesNotMatch(JSON.stringify(dns), /nao-vazar/);
    assert.equal('createDnsRecord' in adapter, false);
    assert.equal('updateDnsRecord' in adapter, false);
    assert.equal('deleteDnsRecord' in adapter, false);
  });
});
