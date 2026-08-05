/**
 * Testes do módulo WhatsApp / Evolution API.
 *
 * Cobre as garantias que justificam o módulo existir em homologação:
 * mascaramento, allowlist, rate limit, deduplicação, assinatura de webhook, e
 * a impossibilidade estrutural de enviar mensagem nesta fase.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { maskPhone, isAllowedQueryCommand, ALLOWED_QUERY_COMMANDS } from '../../packages/integrations/src/evolution/types.js';
import { createPhoneAllowlist, EMPTY_ALLOWLIST } from '../../packages/integrations/src/evolution/allowlist.js';
import { createRateLimiter, createDeduplicator } from '../../packages/integrations/src/evolution/rate-limit.js';
import { verifyWebhookSignature } from '../../packages/integrations/src/evolution/webhook-auth.js';
import { createMockEvolutionAdapter, createHttpEvolutionAdapter } from '../../packages/integrations/src/evolution/adapter.js';
import { createEmptyClientDirectory, createStaticClientDirectory } from '../../packages/integrations/src/evolution/client-directory.js';
import { createCommandHandler } from '../../packages/integrations/src/evolution/command-handler.js';
import { createWhatsAppModule } from '../../packages/integrations/src/evolution/index.js';

import { ActionExecutor } from '../../packages/domain/src/executor.js';
import { createDefaultRegistry } from '../../packages/domain/src/actions.js';
import { createMockAdapterSet } from '../../packages/integrations/src/adapters/mock.js';
import { createKillSwitch } from '../../packages/security/src/kill-switch.js';
import { createDenyAllApprovalProvider, createSingleUseApprovalProvider } from '../../packages/security/src/approval.js';
import { createMemoryAuditProvider } from '../../packages/audit/src/audit.js';
import { createLogger } from '../../packages/shared/src/logger.js';

const silentLogger = createLogger({ level: 'error', service: 'test', sink: () => {} });

function buildExecutor(engaged = true) {
  const adapters = createMockAdapterSet();
  return new ActionExecutor({
    registry: createDefaultRegistry(adapters),
    killSwitch: createKillSwitch({ engaged }),
    approval: engaged
      ? createDenyAllApprovalProvider()
      : createSingleUseApprovalProvider([{ kind: 'whatsapp.message.send', approvedBy: 'teste' }]),
    audit: createMemoryAuditProvider(),
    logger: silentLogger,
    dryRun: engaged,
  });
}

// -----------------------------------------------------------------------------
describe('maskPhone', () => {
  it('mascara mantendo os ultimos 4 digitos visiveis', () => {
    const masked = maskPhone('5511987654321');
    assert.match(masked, /4321$/);
    assert.doesNotMatch(masked, /987654321/);
  });

  it('nunca revela o numero completo', () => {
    const masked = maskPhone('+55 11 98765-4321');
    assert.doesNotMatch(masked, /987654321/);
  });

  it('lida com entrada curta sem lançar', () => {
    assert.equal(maskPhone('123'), '****');
  });
});

describe('isAllowedQueryCommand', () => {
  it('reconhece todos os 10 comandos declarados', () => {
    assert.equal(ALLOWED_QUERY_COMMANDS.length, 10);
    for (const c of ALLOWED_QUERY_COMMANDS) assert.equal(isAllowedQueryCommand(c), true);
  });

  it('rejeita comandos de escrita', () => {
    for (const c of ['criar_repositorio', 'enviar_mensagem_cliente', 'excluir_recurso']) {
      assert.equal(isAllowedQueryCommand(c), false);
    }
  });

  it('rejeita comando arbitrario/injetado', () => {
    assert.equal(isAllowedQueryCommand('; rm -rf /'), false);
    assert.equal(isAllowedQueryCommand(''), false);
  });
});

// -----------------------------------------------------------------------------
describe('allowlist', () => {
  it('nega tudo quando vazia', () => {
    assert.equal(EMPTY_ALLOWLIST.isAllowed('5511999999999'), false);
  });

  it('permite apenas numeros cadastrados', () => {
    const list = createPhoneAllowlist(['5511999999999']);
    assert.equal(list.isAllowed('5511999999999'), true);
    assert.equal(list.isAllowed('5511888888888'), false);
  });

  it('normaliza formatacao antes de comparar', () => {
    const list = createPhoneAllowlist(['+55 (11) 99999-9999']);
    assert.equal(list.isAllowed('5511999999999'), true);
  });
});

describe('rate limiter', () => {
  it('permite ate o limite e recusa depois', () => {
    const t = 0;
    const limiter = createRateLimiter(3, 60_000, () => t);
    assert.equal(limiter.check('x'), true);
    assert.equal(limiter.check('x'), true);
    assert.equal(limiter.check('x'), true);
    assert.equal(limiter.check('x'), false);
  });

  it('libera apos a janela passar', () => {
    let t = 0;
    const limiter = createRateLimiter(1, 1000, () => t);
    assert.equal(limiter.check('x'), true);
    assert.equal(limiter.check('x'), false);
    t = 1500;
    assert.equal(limiter.check('x'), true);
  });

  it('nao mistura contadores de chaves diferentes', () => {
    const t = 0;
    const limiter = createRateLimiter(1, 60_000, () => t);
    assert.equal(limiter.check('a'), true);
    assert.equal(limiter.check('b'), true);
  });
});

describe('deduplicador', () => {
  it('processa a primeira vez e ignora repeticoes', () => {
    const dedup = createDeduplicator();
    assert.equal(dedup.isNew('msg-1'), true);
    assert.equal(dedup.isNew('msg-1'), false);
    assert.equal(dedup.isNew('msg-2'), true);
  });

  it('descarta o mais antigo ao exceder a capacidade', () => {
    const dedup = createDeduplicator(2);
    assert.equal(dedup.isNew('a'), true);
    assert.equal(dedup.isNew('b'), true);
    assert.equal(dedup.isNew('c'), true); // expulsa 'a'
    assert.equal(dedup.isNew('a'), true); // 'a' esquecido, processa de novo
  });
});

// -----------------------------------------------------------------------------
describe('verifyWebhookSignature', () => {
  const secret = 'segredo-de-teste'; // pragma: allowlist-secret

  it('aceita assinatura correta', () => {
    const payload = '{"from":"5511999999999","text":"status"}';
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    const result = verifyWebhookSignature(payload, `sha256=${sig}`, secret);
    assert.equal(result.valid, true);
  });

  it('rejeita assinatura incorreta', () => {
    const result = verifyWebhookSignature('{"a":1}', 'sha256=' + 'f'.repeat(64), secret);
    assert.equal(result.valid, false);
  });

  it('rejeita quando a assinatura esta ausente', () => {
    const result = verifyWebhookSignature('{"a":1}', undefined, secret);
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /ausente/);
  });

  it('rejeita quando o segredo nao esta configurado', () => {
    const result = verifyWebhookSignature('{"a":1}', 'sha256=abc', '');
    assert.equal(result.valid, false);
  });

  it('detecta payload alterado (mesma assinatura, corpo diferente)', () => {
    const payload = '{"from":"5511999999999","text":"status"}';
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    const tampered = '{"from":"5511999999999","text":"enviar_mensagem_cliente"}';
    const result = verifyWebhookSignature(tampered, `sha256=${sig}`, secret);
    assert.equal(result.valid, false);
  });
});

// -----------------------------------------------------------------------------
describe('adaptador mock', () => {
  it('esta desabilitado e sem acoes de escrita', async () => {
    const adapter = createMockEvolutionAdapter();
    assert.equal(adapter.enabled, false);
    assert.equal(adapter.writeActionsEnabled, false);
  });

  it('sendMessage sempre rejeita', async () => {
    const adapter = createMockEvolutionAdapter();
    await assert.rejects(() => adapter.sendMessage('5511999999999', 'oi'), /writeActionsEnabled/);
  });

  it('listInstances devolve vazio honestamente', async () => {
    const adapter = createMockEvolutionAdapter();
    assert.deepEqual(await adapter.listInstances(), []);
  });
});

describe('adaptador http (sem rede real)', () => {
  it('fica desabilitado sem credenciais', () => {
    const adapter = createHttpEvolutionAdapter({ baseUrl: '', apiKey: '', instanceName: 'x' });
    assert.equal(adapter.enabled, false);
  });

  it('sendMessage rejeita mesmo com credenciais presentes', async () => {
    const adapter = createHttpEvolutionAdapter({
      baseUrl: 'http://localhost:1', // pragma: allowlist-secret
      apiKey: 'fake-key-for-shape-only', // pragma: allowlist-secret
      instanceName: 'test',
    });
    assert.equal(adapter.enabled, true);
    await assert.rejects(() => adapter.sendMessage('5511999999999', 'oi'), /writeActionsEnabled/);
  });
});

// -----------------------------------------------------------------------------
describe('command handler — comandos de leitura', () => {
  it('responde ajuda com a lista de comandos', async () => {
    const handler = createCommandHandler({
      executor: buildExecutor(),
      clients: createEmptyClientDirectory(),
      githubOwner: 'dadocruz',
    });
    const res = await handler({ command: 'ajuda', args: [], correlationId: 'c1', maskedFrom: '+55****0000' });
    assert.equal(res.ok, true);
    assert.match(res.text, /status_vps/);
  });

  it('recusa comando desconhecido', async () => {
    const handler = createCommandHandler({
      executor: buildExecutor(),
      clients: createEmptyClientDirectory(),
      githubOwner: 'dadocruz',
    });
    const res = await handler({ command: 'deletar_tudo', args: [], correlationId: 'c2', maskedFrom: '+55****0000' });
    assert.equal(res.ok, false);
  });

  it('responde status usando o executor real (kill switch ligado)', async () => {
    const handler = createCommandHandler({
      executor: buildExecutor(true),
      clients: createEmptyClientDirectory(),
      githubOwner: 'dadocruz',
    });
    const res = await handler({ command: 'status', args: [], correlationId: 'c3', maskedFrom: '+55****0000' });
    assert.equal(res.ok, true);
    assert.match(res.text, /Kill switch ativo/);
  });

  it('listar_clientes usa o ClientDirectoryProvider e nao inventa dado', async () => {
    const handler = createCommandHandler({
      executor: buildExecutor(),
      clients: createStaticClientDirectory({
        clients: [{ slug: 'vivere', name: 'Vivere', status: 'ativo' }],
      }),
      githubOwner: 'dadocruz',
    });
    const res = await handler({ command: 'listar_clientes', args: [], correlationId: 'c4', maskedFrom: '+55****0000' });
    assert.match(res.text, /Vivere/);
  });

  it('listar_clientes com diretorio vazio nao inventa registro', async () => {
    const handler = createCommandHandler({
      executor: buildExecutor(),
      clients: createEmptyClientDirectory(),
      githubOwner: 'dadocruz',
    });
    const res = await handler({ command: 'listar_clientes', args: [], correlationId: 'c5', maskedFrom: '+55****0000' });
    assert.match(res.text, /nenhum registro/);
  });

  it('todos os comandos permitidos tem resposta, mesmo sem dado', async () => {
    const handler = createCommandHandler({
      executor: buildExecutor(),
      clients: createEmptyClientDirectory(),
      githubOwner: 'dadocruz',
    });
    for (const command of ALLOWED_QUERY_COMMANDS) {
      const res = await handler({ command, args: [], correlationId: `c-${command}`, maskedFrom: '+55****0000' });
      assert.ok(res.text.length > 0, `comando ${command} nao respondeu`);
    }
  });
});

// -----------------------------------------------------------------------------
describe('modulo completo — processIncoming', () => {
  it('rejeita numero fora da allowlist sem revelar detalhe', async () => {
    const mod = createWhatsAppModule({
      allowedNumbers: ['5511999999999'],
      rateLimitPerMinute: 10,
      executor: buildExecutor(),
      logger: silentLogger,
      githubOwner: 'dadocruz',
    });
    const res = await mod.processIncoming(
      { from: '5511000000000', body: 'ajuda', messageId: 'm1', receivedAt: new Date().toISOString() },
      'c1',
    );
    assert.equal(res.ok, false);
  });

  it('processa numero autorizado com comando valido', async () => {
    const mod = createWhatsAppModule({
      allowedNumbers: ['5511999999999'],
      rateLimitPerMinute: 10,
      executor: buildExecutor(),
      logger: silentLogger,
      githubOwner: 'dadocruz',
    });
    const res = await mod.processIncoming(
      { from: '5511999999999', body: 'ajuda', messageId: 'm2', receivedAt: new Date().toISOString() },
      'c2',
    );
    assert.equal(res.ok, true);
  });

  it('ignora mensagem duplicada (mesmo messageId)', async () => {
    const mod = createWhatsAppModule({
      allowedNumbers: ['5511999999999'],
      rateLimitPerMinute: 10,
      executor: buildExecutor(),
      logger: silentLogger,
      githubOwner: 'dadocruz',
    });
    const first = await mod.processIncoming(
      { from: '5511999999999', body: 'ajuda', messageId: 'dup-1', receivedAt: new Date().toISOString() },
      'c3',
    );
    const second = await mod.processIncoming(
      { from: '5511999999999', body: 'ajuda', messageId: 'dup-1', receivedAt: new Date().toISOString() },
      'c4',
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
  });

  it('aplica rate limit por numero', async () => {
    const mod = createWhatsAppModule({
      allowedNumbers: ['5511999999999'],
      rateLimitPerMinute: 2,
      executor: buildExecutor(),
      logger: silentLogger,
      githubOwner: 'dadocruz',
    });
    const send = (id: string) =>
      mod.processIncoming(
        { from: '5511999999999', body: 'ajuda', messageId: id, receivedAt: new Date().toISOString() },
        id,
      );
    assert.equal((await send('r1')).ok, true);
    assert.equal((await send('r2')).ok, true);
    assert.equal((await send('r3')).ok, false);
  });

  it('writeActionsEnabled e sempre false no modulo', () => {
    const mod = createWhatsAppModule({
      allowedNumbers: [],
      rateLimitPerMinute: 10,
      executor: buildExecutor(),
      logger: silentLogger,
      githubOwner: 'dadocruz',
    });
    assert.equal(mod.writeActionsEnabled, false);
  });

  it('nenhum comando do WhatsApp alcanca uma acao MUTANTE do registry', async () => {
    // Guarda estrutural: se alguem adicionar um comando que chame uma acao
    // mutante, este teste quebra. E a diferenca entre "hoje nao alcanca" e
    // "nao pode passar a alcancar sem alguem perceber".
    const registry = createDefaultRegistry(createMockAdapterSet());
    const mutatingKinds = new Set(registry.listMutating().map((d) => d.kind));

    const invoked: string[] = [];
    const spyExecutor = {
      execute: (request: { kind: string }) => {
        invoked.push(request.kind);
        return Promise.resolve({
          status: 'executed' as const,
          kind: request.kind,
          dryRun: true,
          data: [],
          durationMs: 0,
        });
      },
    } as unknown as ActionExecutor;

    const handler = createCommandHandler({
      executor: spyExecutor,
      clients: createEmptyClientDirectory(),
      githubOwner: 'dadocruz',
    });

    for (const command of ALLOWED_QUERY_COMMANDS) {
      await handler({ command, args: [], correlationId: 'guard', maskedFrom: '+55****0000' });
    }

    assert.ok(invoked.length > 0, 'nenhuma acao foi invocada — o teste nao provaria nada');
    for (const kind of invoked) {
      assert.equal(
        mutatingKinds.has(kind),
        false,
        `comando do WhatsApp invocou a acao MUTANTE "${kind}"`,
      );
    }
  });

  it('NUNCA envia mensagem real, mesmo com kill switch desligado e aprovacao concedida', async () => {
    // Este e o teste mais importante do arquivo: prova que desligar o freio
    // global do Control Plane NAO acidentalmente libera o WhatsApp.
    const mod = createWhatsAppModule({
      allowedNumbers: ['5511999999999'],
      rateLimitPerMinute: 10,
      executor: buildExecutor(false), // kill switch DESLIGADO
      logger: silentLogger,
      githubOwner: 'dadocruz',
    });
    await assert.rejects(() => mod.adapter.sendMessage('5511999999999', 'mensagem real'));
  });
});
