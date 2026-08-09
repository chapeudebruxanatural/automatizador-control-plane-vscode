import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  describeMetaCredential,
  loadMetaAccessToken,
  MetaReadClient,
  MetaReadError,
} from '../packages/integrations/src/meta/client.js';
import { createMetaReadAdapter } from '../packages/integrations/src/meta/adapter.js';

describe('credencial Meta', () => {
  it('expõe apenas a presença do token', () => {
    const env = { META_ACCESS_TOKEN: 'token-de-teste' };
    assert.equal(loadMetaAccessToken({ env }), 'token-de-teste');
    const status = describeMetaCredential({ env });
    assert.deepEqual(status, {
      configured: true,
      source: 'environment',
      reference: 'META_ACCESS_TOKEN',
    });
    assert.doesNotMatch(JSON.stringify(status), /token-de-teste/);
  });
});

describe('cliente Meta somente leitura', () => {
  it('usa Graph API v26, apenas GET e token somente no cabeçalho', async () => {
    const calls: Array<{ url: string; method: string; authorization: string }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? 'GET',
        authorization: new Headers(init?.headers).get('Authorization') ?? '',
      });
      const secondPage = url.includes('after=cursor-1');
      return new Response(
        JSON.stringify(
          secondPage
            ? { data: [{ id: 'act_2', name: 'Dois', account_status: 1, currency: 'BRL' }] }
            : {
                data: [{ id: 'act_1', name: 'Um', account_status: 1, currency: 'BRL' }],
                paging: { cursors: { after: 'cursor-1' }, next: 'https://nao-seguir.test' },
              },
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const client = new MetaReadClient({ token: 'token-de-teste', fetchImpl: fakeFetch });

    const accounts = await client.listAdAccounts();

    assert.equal(accounts.length, 2);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.method === 'GET'));
    assert.ok(calls.every((call) => call.authorization === 'Bearer token-de-teste'));
    assert.ok(calls.every((call) => call.url.startsWith('https://graph.facebook.com/v26.0/')));
    assert.ok(calls.every((call) => !call.url.includes('token-de-teste')));
    assert.ok(calls.every((call) => !call.url.startsWith('https://nao-seguir.test')));
  });

  it('não inclui corpo nem mensagem potencialmente sensível na exceção', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: { code: 190, message: 'token-de-teste valor-sensível' } }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    const client = new MetaReadClient({ token: 'token-de-teste', fetchImpl: fakeFetch });

    await assert.rejects(
      client.listAdAccounts(),
      (error: unknown) =>
        error instanceof MetaReadError &&
        error.status === 401 &&
        error.apiCode === 190 &&
        !error.message.includes('token-de-teste') &&
        !error.message.includes('valor-sensível'),
    );
  });

  it('mapeia contas e campanhas e recusa escrita', async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const campaigns = String(input).includes('/campaigns?');
      return new Response(
        JSON.stringify({
          data: campaigns
            ? [{ id: 'camp-1', name: 'Campanha', status: 'ACTIVE', daily_budget: '1234' }]
            : [{ id: 'act_1', name: 'ADM 01', account_status: 1, currency: 'BRL' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const adapter = createMetaReadAdapter(
      new MetaReadClient({ token: 'teste', baseUrl: 'https://meta.test', fetchImpl: fakeFetch }),
    );

    assert.deepEqual(await adapter.listAdAccounts(), [
      { id: 'act_1', name: 'ADM 01', status: '1', currency: 'BRL', queryable: true },
    ]);
    assert.deepEqual(await adapter.listCampaigns('act_1'), [
      {
        id: 'camp-1',
        name: 'Campanha',
        status: 'ACTIVE',
        dailyBudgetCents: 1234,
      },
    ]);
    await assert.rejects(adapter.pauseCampaign('camp-1'), /não está implementada/);
  });
});
