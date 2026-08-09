/**
 * Testes de fronteira do Google Ads.
 *
 * Todos usam transporte falso — nenhuma chamada de rede, nenhuma credencial.
 * O que está sendo testado não é a API do Google: é que **nós** recusamos o
 * que deve ser recusado antes de chegar nela.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  describeCredentials,
  loadGoogleAdsDeveloperToken,
  keyPermissionWarning,
  MCC_LOGIN_CUSTOMER_ID,
  ADVERTISER_CUSTOMER_ID,
} from '../../packages/integrations/src/google-ads/credential-provider.js';
import {
  assertAuthorizedCustomer,
  assertAuthorizedCampaign,
  assertCampaignBelongsTo,
  assertCampaignMutable,
  isRemovedByOwner,
  isFrozenByOwner,
  normalizeCustomerId,
  ScopeViolationError,
  AUTHORIZED_CAMPAIGNS,
} from '../../packages/integrations/src/google-ads/scope.js';
import { GOOGLE_ADS_API_VERSION } from '../../packages/integrations/src/google-ads/transport.js';
import {
  createGoogleAdsReadAdapter,
  assertReadOnlyQuery,
  isMicroConversion,
  GoogleAdsUnavailableError,
  type GoogleAdsSearchTransport,
} from '../../packages/integrations/src/google-ads/read-adapter.js';

const fakeTransport: GoogleAdsSearchTransport = {
  apiVersion: 'v18',
  searchStream: () => Promise.resolve({ rows: [], requestId: 'req-fake-123' }),
  listAccessibleCustomers: () =>
    Promise.resolve({
      resourceNames: [`customers/${MCC_LOGIN_CUSTOMER_ID}`, `customers/${ADVERTISER_CUSTOMER_ID}`],
      requestId: 'req-fake-list',
    }),
};

const availableCreds = {
  authMode: 'service_account' as const,
  credentialReference: '/caminho/protegido/chave.json',
  developerTokenConfigured: true,
  loginCustomerIdConfigured: true,
  liveReadVerified: false,
  keyFileMode: '600',
};

const unavailableCreds = {
  authMode: 'unavailable' as const,
  credentialReference: null,
  developerTokenConfigured: false,
  loginCustomerIdConfigured: true,
  liveReadVerified: false,
  unavailableReason: 'diretório protegido não encontrado',
};

// -----------------------------------------------------------------------------
describe('credenciais: nunca expõem valor', () => {
  it('describeCredentials devolve apenas metadados, nunca conteúdo', async () => {
    const status = await describeCredentials({ secretDir: '/caminho/que/nao/existe' });
    const serialized = JSON.stringify(status);

    assert.equal(status.authMode, 'unavailable');
    assert.equal(status.credentialReference, null);
    // Nenhum campo que possa carregar segredo.
    assert.doesNotMatch(serialized, /BEGIN [A-Z ]*PRIVATE KEY/);
    assert.doesNotMatch(serialized, /"private_key"/);
    assert.doesNotMatch(serialized, /"client_secret"/);
  });

  it('falha fechada quando o diretório protegido não existe', async () => {
    const status = await describeCredentials({ secretDir: '/nao/existe/mesmo' });
    assert.equal(status.authMode, 'unavailable');
    assert.equal(status.liveReadVerified, false);
  });

  it('liveReadVerified nunca é true sem verificação real', async () => {
    const status = await describeCredentials({ secretDir: '/nao/existe' });
    assert.equal(status.liveReadVerified, false);
  });

  it('avisa quando a permissão da chave está frouxa', () => {
    assert.equal(keyPermissionWarning({ ...availableCreds, keyFileMode: '600' }), null);
    assert.match(keyPermissionWarning({ ...availableCreds, keyFileMode: '644' }) ?? '', /600/);
    assert.match(keyPermissionWarning({ ...availableCreds, keyFileMode: '777' }) ?? '', /além do dono/);
  });
});

// -----------------------------------------------------------------------------
describe('escopo: conta', () => {
  it('aceita apenas a conta autorizada', () => {
    assert.equal(assertAuthorizedCustomer('2656966896'), '2656966896');
    assert.equal(assertAuthorizedCustomer('265-696-6896'), '2656966896');
    assert.equal(assertAuthorizedCustomer('customers/2656966896'), '2656966896');
  });

  it('RECUSA conta diferente da autorizada', () => {
    for (const wrong of ['1234567890', '399-259-4849', '2656966897']) {
      assert.throws(() => assertAuthorizedCustomer(wrong), ScopeViolationError, `aceitou ${wrong}`);
    }
  });

  it('um dígito errado nao vira consulta a outro anunciante', () => {
    assert.throws(() => assertAuthorizedCustomer('2656966890'), ScopeViolationError);
  });

  it('normaliza formatos diferentes para o mesmo id', () => {
    assert.equal(normalizeCustomerId('265-696-6896'), '2656966896');
    assert.equal(normalizeCustomerId('customers/2656966896'), '2656966896');
  });
});

describe('escopo: campanha', () => {
  it('aceita campanha da allowlist', () => {
    assert.equal(assertAuthorizedCampaign('24066140634').clientSlug, 'cassio-ferraz');
    assert.equal(assertAuthorizedCampaign('24079586567').clientSlug, 'gaveta-producoes');
  });

  it('RECUSA campanha fora da allowlist', () => {
    assert.throws(() => assertAuthorizedCampaign('99999999999'), ScopeViolationError);
  });

  it('CASSIO e GAVETA permanecem separados', () => {
    // A conta é compartilhada; sem esta checagem, pedir a campanha do Cássio
    // declarando gaveta-producoes traria dado do cliente errado sem erro.
    assert.doesNotThrow(() => assertCampaignBelongsTo('24066140634', 'cassio-ferraz'));
    assert.doesNotThrow(() => assertCampaignBelongsTo('24079586567', 'gaveta-producoes'));

    assert.throws(
      () => assertCampaignBelongsTo('24066140634', 'gaveta-producoes'),
      ScopeViolationError,
      'campanha do Cassio aceita como sendo da Gaveta',
    );
    assert.throws(
      () => assertCampaignBelongsTo('24079586567', 'cassio-ferraz'),
      ScopeViolationError,
      'campanha da Gaveta aceita como sendo do Cassio',
    );
  });

  it('a campanha do Cassio nao atende por outro slug', () => {
    // Garbo e NovaCena agora ESTÃO na allowlist (read_only_scope). O que continua
    // proibido é pedir a campanha do Cássio declarando outro dono — que é o erro
    // que vazaria dado entre clientes numa conta compartilhada.
    for (const slug of ['garbo-eventos', 'novacena', 'vivere']) {
      assert.throws(() => assertCampaignBelongsTo('24066140634', slug), ScopeViolationError);
    }
  });

  it('Garbo e NovaCena sao legiveis e cada campanha responde pelo seu dono', () => {
    const esperado: Record<string, string> = {
      '24016194642': 'garbo-eventos',
      '24016194645': 'garbo-eventos',
      '24016194648': 'garbo-eventos',
      '24016194651': 'garbo-eventos',
      '24016194654': 'garbo-eventos',
      '23956482634': 'novacena',
      '23951683643': 'novacena',
    };
    for (const [id, slug] of Object.entries(esperado)) {
      assert.doesNotThrow(() => assertCampaignBelongsTo(id, slug), `${id} deveria ser de ${slug}`);
    }
  });

  it('os cinco IDs da Garbo sao distintos', () => {
    // Regressão de 07/08: a primeira coleta inferiu os IDs por proximidade no
    // HTML da interface e repetiu o mesmo número em duas linhas. IDs colados
    // fariam duas campanhas diferentes apontarem para a mesma — silenciosamente.
    const garbo = AUTHORIZED_CAMPAIGNS.filter((c) => c.clientSlug === 'garbo-eventos');
    assert.equal(garbo.length, 5);
    assert.equal(new Set(garbo.map((c) => c.campaignId)).size, 5, 'há ID repetido na Garbo');
    assert.equal(new Set(garbo.map((c) => c.expectedName)).size, 5, 'há nome repetido na Garbo');
  });

  it('RECUSA mutate em tudo que entrou so para auditoria', () => {
    for (const c of AUTHORIZED_CAMPAIGNS.filter((x) => x.lifecycle === 'read_only_scope')) {
      assert.throws(
        () => assertCampaignMutable(c.campaignId as string),
        /read_only_scope/,
        `${c.clientSlug}/${c.campaignId} aceitou mutate`,
      );
    }
  });

  it('nenhum cliente novo entra como gravavel por descuido', () => {
    // Só Cássio pode ser alterado. Se um dia outro slug aparecer como
    // active_scope, foi decisão de alguém — e este teste obriga a decisão a ser
    // explícita em vez de acidental.
    const gravaveis = AUTHORIZED_CAMPAIGNS.filter((c) => c.lifecycle === 'active_scope');
    assert.deepEqual([...new Set(gravaveis.map((c) => c.clientSlug))], ['cassio-ferraz']);
  });

  it('campanha da Gaveta esta marcada como removed_by_owner', () => {
    assert.equal(isRemovedByOwner('24079586567'), true);
    assert.equal(isRemovedByOwner('24066140634'), false);
  });

  it('o Buteco Sertanejo esta congelado por instrucao do dono', () => {
    const buteco = AUTHORIZED_CAMPAIGNS.find((c) => c.clientSlug === 'buteco-sertanejo');
    assert.ok(buteco, 'Buteco ausente da allowlist');
    assert.equal(buteco?.campaignId, '24105770570', 'ID confirmado em 06/08');
    assert.equal(buteco?.lifecycle, 'frozen_by_owner');
    assert.equal(buteco?.expectedName, 'DG | Buteco Sertanejo | Shorts | Spotify');
  });

  it('congelada e removida sao coisas diferentes', () => {
    assert.equal(isFrozenByOwner('24105770570'), true);
    assert.equal(isRemovedByOwner('24105770570'), false);
    assert.equal(isFrozenByOwner('24079586567'), false);
    assert.equal(isFrozenByOwner('24066140634'), false);
  });

  it('RECUSA mutate em campanha congelada, e o Cassio segue liberado', () => {
    assert.throws(() => assertCampaignMutable('24105770570'), /frozen_by_owner/);
    assert.throws(() => assertCampaignMutable('24079586567'), /removed_by_owner/);
    assert.doesNotThrow(() => assertCampaignMutable('24066140634'));
  });

  it('a protecao do Buteco nao depende do ID estar ausente da allowlist', () => {
    // Regressão de 06/08: antes o Buteco só escapava de mutate porque o ID não
    // constava na lista. Preencher o ID — que já estava documentado no HANDOFF —
    // teria removido a proteção sem nenhum teste acusando.
    const buteco = AUTHORIZED_CAMPAIGNS.find((c) => c.clientSlug === 'buteco-sertanejo');
    assert.notEqual(buteco?.campaignId, null, 'o ID agora está preenchido');
    assert.throws(() => assertCampaignMutable(buteco?.campaignId as string));
  });
});

// -----------------------------------------------------------------------------
describe('somente leitura', () => {
  it('o adaptador nao expoe NENHUM metodo de escrita', () => {
    const adapter = createGoogleAdsReadAdapter({
      credentials: availableCreds,
      transport: fakeTransport,
    });
    const forbidden = ['create', 'update', 'remove', 'pause', 'enable', 'mutate', 'setBudget', 'delete'];
    for (const method of forbidden) {
      assert.equal(
        method in adapter,
        false,
        `o adaptador expoe o metodo proibido "${method}"`,
      );
    }
  });

  it('writeActionsEnabled e sempre false', () => {
    const adapter = createGoogleAdsReadAdapter({
      credentials: availableCreds,
      transport: fakeTransport,
    });
    assert.equal(adapter.writeActionsEnabled, false);
  });

  it('GAQL de escrita e recusado', () => {
    for (const q of [
      'UPDATE campaign SET status = PAUSED',
      'DELETE FROM campaign',
      'MUTATE campaign',
      'SELECT campaign.id FROM campaign; UPDATE campaign SET x=1',
    ]) {
      assert.throws(() => assertReadOnlyQuery(q), `aceitou GAQL de escrita: ${q}`);
    }
  });

  it('GAQL de leitura e aceito', () => {
    assert.doesNotThrow(() => assertReadOnlyQuery('SELECT campaign.id FROM campaign'));
  });
});

// -----------------------------------------------------------------------------
describe('falha fechada e procedencia', () => {
  it('sem credencial, LANCA em vez de devolver histórico', async () => {
    const adapter = createGoogleAdsReadAdapter({ credentials: unavailableCreds, transport: null });
    assert.equal(adapter.enabled, false);

    await assert.rejects(
      () => adapter.getAccountSummary(ADVERTISER_CUSTOMER_ID),
      GoogleAdsUnavailableError,
    );
    await assert.rejects(() => adapter.listAccessibleCustomers(), GoogleAdsUnavailableError);
  });

  it('API indisponivel nao devolve dado historico como atual', async () => {
    const adapter = createGoogleAdsReadAdapter({ credentials: unavailableCreds, transport: null });
    try {
      await adapter.listCampaigns(ADVERTISER_CUSTOMER_ID);
      assert.fail('deveria ter lançado');
    } catch (err) {
      assert.ok(err instanceof GoogleAdsUnavailableError);
      assert.match((err as Error).message, /hist[oó]rico/i);
    }
  });

  it('toda leitura ao vivo carrega timestamp, requestId e versao da API', async () => {
    const adapter = createGoogleAdsReadAdapter({
      credentials: availableCreds,
      transport: fakeTransport,
    });
    const result = await adapter.listCampaigns(ADVERTISER_CUSTOMER_ID);

    assert.match(result.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(result.requestId, 'req-fake-123');
    assert.equal(result.apiVersion, 'v18');
    assert.equal(result.customerId, ADVERTISER_CUSTOMER_ID);
  });

  it('consulta a conta errada e recusada antes de virar chamada de rede', async () => {
    let called = false;
    const spy: GoogleAdsSearchTransport = {
      ...fakeTransport,
      searchStream: () => {
        called = true;
        return Promise.resolve({ rows: [], requestId: 'x' });
      },
    };
    const adapter = createGoogleAdsReadAdapter({ credentials: availableCreds, transport: spy });

    await assert.rejects(() => adapter.getAccountSummary('1234567890'), ScopeViolationError);
    assert.equal(called, false, 'chegou a chamar a rede com conta fora do escopo');
  });
});

// -----------------------------------------------------------------------------
describe('conversoes', () => {
  it('WhatsApp e classificado como MICROconversao', () => {
    assert.equal(isMicroConversion('CASSIO | CLIQUE WHATSAPP'), true);
    assert.equal(isMicroConversion('Clique no WhatsApp'), true);
  });

  it('lead qualificado NAO e microconversao', () => {
    assert.equal(isMicroConversion('CASSIO | LEAD QUALIFICADO | FORM'), false);
  });
});

// -----------------------------------------------------------------------------
describe('caminho explicito de credencial', () => {
  it('GOOGLE_ADS_KEY_PATH aponta a chave usada', async () => {
    // O proprio arquivo de teste serve: so o caminho importa, nao o conteudo.
    const aqui = fileURLToPath(import.meta.url);
    const status = await describeCredentials({
      env: { GOOGLE_ADS_DEVELOPER_TOKEN: 'x', GOOGLE_ADS_KEY_PATH: aqui },
      secretDir: '/diretorio/que/nao/existe',
    });
    assert.equal(status.credentialReference, aqui);
  });

  it('caminho declarado e invalido NAO cai no diretorio padrao', async () => {
    // Cair de volta leria a credencial errada numa conta compartilhada.
    const status = await describeCredentials({
      env: { GOOGLE_ADS_DEVELOPER_TOKEN: 'x', GOOGLE_ADS_KEY_PATH: '/nao/existe.json' },
    });
    assert.equal(status.authMode, 'unavailable');
    assert.equal(status.credentialReference, null);
  });

  it('developer token pode ser lido por caminho protegido sem entrar no env', async () => {
    // O próprio teste é conteúdo inofensivo e serve para provar apenas a rota
    // de leitura; nenhum segredo real participa desta suíte.
    const aqui = fileURLToPath(import.meta.url);
    const token = await loadGoogleAdsDeveloperToken({
      env: { GOOGLE_ADS_DEVELOPER_TOKEN_PATH: aqui },
      secretDir: '/diretorio/que/nao/existe',
    });
    assert.match(token, /Testes de fronteira do Google Ads/);
  });

  it('caminho explícito inválido do developer token falha fechado', async () => {
    await assert.rejects(
      () =>
        loadGoogleAdsDeveloperToken({
          env: { GOOGLE_ADS_DEVELOPER_TOKEN_PATH: '/nao/existe-token' },
        }),
      /não configurado/,
    );
  });
});

// -----------------------------------------------------------------------------
/**
 * Versao da API.
 *
 * Existe porque isso ja quebrou em producao: em 05/08/2026 o Google comecou a
 * bloquear a v21 em rollout, e a integracao inteira passou a falhar de forma
 * intermitente sem que nada no repositorio tivesse mudado. Lint, typecheck,
 * teste e build seguiam verdes.
 *
 * Estes testes nao alcancam a rede — nao dizem se a versao continua ativa no
 * Google. O que eles travam sao as duas decisoes que a escolha da versao
 * carrega, para que trocar o numero exija ler o motivo.
 */
describe('versao da API', () => {
  it('nao usa versao que o Google ja bloqueia', () => {
    const BLOQUEADAS = ['v21'];
    assert.ok(
      !BLOQUEADAS.includes(GOOGLE_ADS_API_VERSION),
      `${GOOGLE_ADS_API_VERSION} devolve UNSUPPORTED_VERSION. Suba a versao.`,
    );
  });

  it('nao passa da v22 sem resolver os campos de data', () => {
    // A partir da v23, campaign.start_date e campaign.end_date devolvem
    // UNRECOGNIZED_FIELD. O write-adapter estende a data final da campanha do
    // Cassio por esses campos: subir a versao sem substitui-los quebraria a
    // operacao em producao, em silencio, com o build verde.
    const numero = Number(GOOGLE_ADS_API_VERSION.replace('v', ''));
    assert.ok(Number.isFinite(numero), 'versao deve ser vXX');
    assert.ok(
      numero <= 22,
      `v${numero} removeu campaign.start_date/end_date. Ajuste o write-adapter ` +
        'antes de subir, e atualize este teste junto.',
    );
  });
});
