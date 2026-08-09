/**
 * Testes da configuração.
 *
 * A propriedade essencial: **falha fechada**. Nenhum valor ausente, vazio ou
 * malformado pode resultar em permissão de escrita.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig, describePosture } from '../packages/shared/src/config.js';
import {
  VERIFICATION_STATUSES,
  isVerificationStatus,
  isActionable,
  isStale,
} from '../packages/domain/src/verification.js';

describe('kill switch na configuração', () => {
  it('vem acionado quando a variável não existe', () => {
    assert.equal(loadConfig({}).killSwitch, true);
  });

  it('permanece acionado com valor vazio', () => {
    assert.equal(loadConfig({ CONTROL_PLANE_KILL_SWITCH: '' }).killSwitch, true);
  });

  it('permanece acionado com valores ambíguos', () => {
    for (const value of ['0', 'no', 'off', 'nao', 'FALSO', 'flase', 'disabled', 'null']) {
      assert.equal(
        loadConfig({ CONTROL_PLANE_KILL_SWITCH: value }).killSwitch,
        true,
        `"${value}" não pode desligar o freio`,
      );
    }
  });

  it('desliga apenas com o literal "false"', () => {
    assert.equal(loadConfig({ CONTROL_PLANE_KILL_SWITCH: 'false' }).killSwitch, false);
    assert.equal(loadConfig({ CONTROL_PLANE_KILL_SWITCH: 'FALSE' }).killSwitch, false);
    assert.equal(loadConfig({ CONTROL_PLANE_KILL_SWITCH: ' false ' }).killSwitch, false);
  });
});

describe('modo de execução', () => {
  it('é dry-run por padrão', () => {
    assert.equal(loadConfig({}).executionMode, 'dry-run');
  });

  it('ignora "live" enquanto o kill switch estiver acionado', () => {
    const config = loadConfig({ EXECUTION_MODE: 'live' });
    assert.equal(config.killSwitch, true);
    assert.equal(config.executionMode, 'dry-run');
  });

  it('aceita "live" apenas com o kill switch desligado', () => {
    const config = loadConfig({
      EXECUTION_MODE: 'live',
      CONTROL_PLANE_KILL_SWITCH: 'false',
    });
    assert.equal(config.executionMode, 'live');
  });

  it('cai para dry-run com modo inválido', () => {
    const config = loadConfig({
      EXECUTION_MODE: 'turbo',
      CONTROL_PLANE_KILL_SWITCH: 'false',
    });
    assert.equal(config.executionMode, 'dry-run');
  });
});

describe('demais padrões seguros', () => {
  it('exige aprovação humana por padrão', () => {
    assert.equal(loadConfig({}).requireHumanApproval, true);
  });

  it('mantém o WhatsApp desligado mesmo se o ambiente pedir o contrário', () => {
    assert.equal(loadConfig({ WHATSAPP_ENABLED: 'true' }).whatsappEnabled, false);
  });

  it('usa porta padrão quando o valor é inválido', () => {
    assert.equal(loadConfig({ PORT: 'abc' }).port, 3000);
    assert.equal(loadConfig({ PORT: '99999' }).port, 3000);
    assert.equal(loadConfig({ PORT: '8080' }).port, 8080);
  });

  it('usa nível de log padrão quando o valor é inválido', () => {
    assert.equal(loadConfig({ LOG_LEVEL: 'verbose' }).logLevel, 'info');
  });
});

describe('postura exposta em /status', () => {
  it('reporta presença de credencial, nunca o valor', () => {
    const config = loadConfig({});
    const posture = describePosture(config, { N8N_API_KEY: 'valor-que-nao-deve-vazar' });

    const serialized = JSON.stringify(posture);
    assert.doesNotMatch(serialized, /valor-que-nao-deve-vazar/);
    assert.equal(posture.integrations.n8n.credentialConfigured, true);
    assert.equal(posture.integrations.cloudflare.credentialConfigured, false);
  });

  it('reporta todas as integrações como desabilitadas nesta fase', () => {
    const posture = describePosture(loadConfig({}), {});
    for (const [name, state] of Object.entries(posture.integrations)) {
      assert.equal(state.enabled, false, `${name} deveria estar desabilitada`);
    }
  });

  it('trata variável vazia como não configurada', () => {
    const posture = describePosture(loadConfig({}), { N8N_API_KEY: '   ' });
    assert.equal(posture.integrations.n8n.credentialConfigured, false);
  });

  it('reconhece caminho protegido da Cloudflare sem ler o segredo', () => {
    const posture = describePosture(loadConfig({}), {
      CLOUDFLARE_API_TOKEN_PATH: '/caminho/protegido/api-token',
    });
    assert.equal(posture.integrations.cloudflare.credentialConfigured, true);
    assert.doesNotMatch(JSON.stringify(posture), /caminho\/protegido/);
  });

  it('reconhece caminho protegido do n8n sem ler o segredo', () => {
    const posture = describePosture(loadConfig({}), {
      N8N_API_KEY_PATH: '/caminho/protegido/api-key',
    });
    assert.equal(posture.integrations.n8n.credentialConfigured, true);
    assert.doesNotMatch(JSON.stringify(posture), /caminho\/protegido/);
  });

  it('expõe Cloudflare como habilitada só quando o adaptador real foi injetado', () => {
    const posture = describePosture(
      loadConfig({}),
      { CLOUDFLARE_API_TOKEN_PATH: '/caminho/protegido/api-token' },
      { cloudflare: true },
    );
    assert.equal(posture.integrations.cloudflare.enabled, true);
    assert.equal(posture.integrations.n8n.enabled, false);
  });

  it('reconhece o gh CLI como fonte local sem exigir token no ambiente', () => {
    const posture = describePosture(
      loadConfig({}),
      { GITHUB_AUTH_MODE: 'gh-cli' },
      { github: true },
    );
    assert.equal(posture.integrations.github.credentialConfigured, true);
    assert.equal(posture.integrations.github.enabled, true);
  });
});

describe('procedência do inventário', () => {
  it('expõe exatamente os valores definidos no ADR 0003', () => {
    assert.deepEqual(
      [...VERIFICATION_STATUSES],
      ['owner_reported', 'discovered', 'verified', 'conflicting', 'stale', 'unknown'],
    );
  });

  it('reconhece valores válidos e rejeita inválidos', () => {
    assert.equal(isVerificationStatus('verified'), true);
    assert.equal(isVerificationStatus('probably'), false);
    assert.equal(isVerificationStatus(42), false);
  });

  it('somente "verified" autoriza ação sem checagem adicional', () => {
    assert.equal(isActionable('verified'), true);
    for (const status of VERIFICATION_STATUSES.filter((s) => s !== 'verified')) {
      assert.equal(isActionable(status), false, `${status} não pode autorizar ação`);
    }
  });

  it('detecta envelhecimento após 90 dias', () => {
    const now = new Date('2026-08-04T00:00:00Z');
    assert.equal(isStale(new Date('2026-07-04T00:00:00Z'), now), false);
    assert.equal(isStale(new Date('2026-01-04T00:00:00Z'), now), true);
  });
});
