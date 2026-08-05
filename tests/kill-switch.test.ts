/**
 * Testes da cadeia de proteção: registro → validação → kill switch → aprovação.
 *
 * Estes são os testes que importam. Se algum deles quebrar, o sistema perdeu a
 * propriedade que justifica sua existência.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { ActionRegistry } from '../packages/domain/src/action.js';
import { ActionExecutor } from '../packages/domain/src/executor.js';
import { createDefaultRegistry } from '../packages/domain/src/actions.js';
import { createKillSwitch } from '../packages/security/src/kill-switch.js';
import {
  createDenyAllApprovalProvider,
  createSingleUseApprovalProvider,
} from '../packages/security/src/approval.js';
import { createMemoryAuditProvider } from '../packages/audit/src/audit.js';
import { createLogger } from '../packages/shared/src/logger.js';
import { createMockAdapterSet } from '../packages/integrations/src/adapters/mock.js';

const silentLogger = createLogger({ level: 'error', service: 'test', sink: () => {} });

function buildRegistry(): ActionRegistry {
  const registry = new ActionRegistry();

  registry.register({
    kind: 'test.read',
    domain: 'system',
    description: 'Ação de leitura.',
    mutating: false,
    schema: z.object({ value: z.string() }).strict(),
    handler: (payload) => Promise.resolve({ echoed: payload.value }),
  });

  registry.register({
    kind: 'test.write',
    domain: 'system',
    description: 'Ação mutante.',
    mutating: true,
    schema: z.object({ value: z.string() }).strict(),
    handler: (payload) => Promise.resolve({ written: payload.value }),
  });

  return registry;
}

function buildExecutor(opts: {
  engaged: boolean;
  approvals?: readonly { kind: string; approvedBy: string }[];
}) {
  const audit = createMemoryAuditProvider();
  const executor = new ActionExecutor({
    registry: buildRegistry(),
    killSwitch: createKillSwitch({ engaged: opts.engaged }),
    approval:
      opts.approvals === undefined
        ? createDenyAllApprovalProvider()
        : createSingleUseApprovalProvider(opts.approvals),
    audit,
    logger: silentLogger,
    dryRun: opts.engaged,
  });
  return { executor, audit };
}

describe('kill switch', () => {
  it('recusa ação mutante quando acionado', async () => {
    const { executor } = buildExecutor({ engaged: true });

    const result = await executor.execute({
      kind: 'test.write',
      target: 'recurso',
      payload: { value: 'x' },
    });

    assert.equal(result.status, 'refused');
    assert.equal(result.status === 'refused' && result.reason, 'blocked_by_kill_switch');
  });

  it('permite ação de leitura quando acionado', async () => {
    const { executor } = buildExecutor({ engaged: true });

    const result = await executor.execute({
      kind: 'test.read',
      target: 'recurso',
      payload: { value: 'olá' },
    });

    assert.equal(result.status, 'executed');
    assert.deepEqual(result.status === 'executed' && result.data, { echoed: 'olá' });
  });

  it('registra a recusa na auditoria', async () => {
    const { executor, audit } = buildExecutor({ engaged: true });

    await executor.execute({ kind: 'test.write', target: 'recurso', payload: { value: 'x' } });

    const events = await audit.list();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.outcome, 'refused');
    assert.equal(events[0]?.mutating, true);
    assert.match(events[0]?.detail ?? '', /blocked_by_kill_switch/);
  });

  it('recusa ANTES de chamar o handler', async () => {
    let handlerCalled = false;
    const registry = new ActionRegistry();
    registry.register({
      kind: 'test.destructive',
      domain: 'system',
      description: 'Nunca deve ser alcançada.',
      mutating: true,
      schema: z.object({}).strict(),
      handler: () => {
        handlerCalled = true;
        return Promise.resolve(null);
      },
    });

    const executor = new ActionExecutor({
      registry,
      killSwitch: createKillSwitch({ engaged: true }),
      approval: createDenyAllApprovalProvider(),
      audit: createMemoryAuditProvider(),
      logger: silentLogger,
      dryRun: true,
    });

    await executor.execute({ kind: 'test.destructive', target: 'alvo', payload: {} });

    assert.equal(handlerCalled, false, 'o handler não pode ser alcançado com o freio acionado');
  });
});

describe('aprovação', () => {
  it('recusa ação mutante sem aprovação, mesmo com o kill switch desligado', async () => {
    const { executor } = buildExecutor({ engaged: false });

    const result = await executor.execute({
      kind: 'test.write',
      target: 'recurso',
      payload: { value: 'x' },
    });

    assert.equal(result.status, 'refused');
    assert.equal(result.status === 'refused' && result.reason, 'approval_required');
  });

  it('executa com kill switch desligado e aprovação válida', async () => {
    const { executor } = buildExecutor({
      engaged: false,
      approvals: [{ kind: 'test.write', approvedBy: 'dono' }],
    });

    const result = await executor.execute({
      kind: 'test.write',
      target: 'recurso',
      payload: { value: 'x' },
    });

    assert.equal(result.status, 'executed');
  });

  it('não reaproveita aprovação: a segunda tentativa é recusada', async () => {
    const { executor } = buildExecutor({
      engaged: false,
      approvals: [{ kind: 'test.write', approvedBy: 'dono' }],
    });

    const first = await executor.execute({
      kind: 'test.write',
      target: 'recurso',
      payload: { value: 'a' },
    });
    const second = await executor.execute({
      kind: 'test.write',
      target: 'recurso',
      payload: { value: 'b' },
    });

    assert.equal(first.status, 'executed');
    assert.equal(second.status, 'refused');
    assert.equal(second.status === 'refused' && second.reason, 'approval_required');
  });
});

describe('validação', () => {
  it('recusa ação não registrada', async () => {
    const { executor } = buildExecutor({ engaged: true });

    const result = await executor.execute({
      kind: 'nao.existe',
      target: 'x',
      payload: {},
    });

    assert.equal(result.status, 'refused');
    assert.equal(result.status === 'refused' && result.reason, 'unknown_action');
  });

  it('recusa payload inválido', async () => {
    const { executor } = buildExecutor({ engaged: true });

    const result = await executor.execute({
      kind: 'test.read',
      target: 'x',
      payload: { value: 123 },
    });

    assert.equal(result.status, 'refused');
    assert.equal(result.status === 'refused' && result.reason, 'invalid_payload');
  });

  it('recusa campos não declarados no esquema', async () => {
    const { executor } = buildExecutor({ engaged: true });

    const result = await executor.execute({
      kind: 'test.read',
      target: 'x',
      payload: { value: 'ok', extra: 'não declarado' },
    });

    assert.equal(result.status, 'refused');
    assert.equal(result.status === 'refused' && result.reason, 'invalid_payload');
  });
});

describe('catálogo padrão', () => {
  it('classifica corretamente ações de leitura e de escrita', () => {
    const registry = createDefaultRegistry(createMockAdapterSet());

    assert.equal(registry.get('vps.containers.list')?.mutating, false);
    assert.equal(registry.get('vps.container.restart')?.mutating, true);
    assert.equal(registry.get('meta.campaign.pause')?.mutating, true);
    assert.equal(registry.get('whatsapp.message.send')?.mutating, true);
  });

  it('não permite registrar a mesma ação duas vezes', () => {
    const registry = buildRegistry();
    assert.throws(
      () =>
        registry.register({
          kind: 'test.read',
          domain: 'system',
          description: 'duplicada',
          mutating: false,
          schema: z.object({}).strict(),
          handler: () => Promise.resolve(null),
        }),
      /já registrada/,
    );
  });
});

describe('whatsapp', () => {
  it('está desligado e recusa envio mesmo sem o kill switch', async () => {
    const adapters = createMockAdapterSet();
    assert.equal(adapters.whatsapp.enabled, false);

    const executor = new ActionExecutor({
      registry: createDefaultRegistry(adapters),
      killSwitch: createKillSwitch({ engaged: false }),
      approval: createSingleUseApprovalProvider([
        { kind: 'whatsapp.message.send', approvedBy: 'dono' },
      ]),
      audit: createMemoryAuditProvider(),
      logger: silentLogger,
      dryRun: false,
    });

    // Freio desligado e aprovação concedida: ainda assim nada é enviado.
    const result = await executor.execute({
      kind: 'whatsapp.message.send',
      target: 'contato',
      payload: { to: '+550000000000', body: 'teste' },
    });

    assert.equal(result.status, 'failed');
    assert.match(result.status === 'failed' ? result.error : '', /desligado por decisão/);
  });
});
