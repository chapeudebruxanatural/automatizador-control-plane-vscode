/**
 * Executor de ações — o caminho único.
 *
 * A ordem dos passos é a garantia do sistema, e vale a pena ser explícito
 * sobre ela:
 *
 *   1. Resolver a ação no registro (não existe execução anônima)
 *   2. Validar o payload contra o esquema
 *   3. Consultar o kill switch, se a ação for mutante
 *   4. Consultar a política de aprovação, se a ação for mutante
 *   5. Executar
 *   6. Auditar o desfecho — qualquer que seja
 *
 * Os passos 3 e 4 ficam aqui, e não nos adaptadores, de propósito. Um freio que
 * cada integração precisa lembrar de acionar é um freio que uma delas vai
 * esquecer. Aqui, esquecer não é uma opção disponível.
 *
 * O passo 6 nunca é pulado. Recusa auditada é o sinal que revela automação
 * tentando escrever antes da hora.
 */

import type { ActionRequest, ActionRegistry, ActionContext } from './action.js';
import type { ActionResult } from './result.js';
import type { KillSwitch } from '../../security/src/kill-switch.js';
import type { ApprovalProvider } from '../../security/src/approval.js';
import type { AuditProvider } from '../../audit/src/audit.js';
import type { Logger } from '../../shared/src/logger.js';

export interface ExecutorDependencies {
  readonly registry: ActionRegistry;
  readonly killSwitch: KillSwitch;
  readonly approval: ApprovalProvider;
  readonly audit: AuditProvider;
  readonly logger: Logger;
  readonly dryRun: boolean;
}

export class ActionExecutor {
  readonly #deps: ExecutorDependencies;

  constructor(deps: ExecutorDependencies) {
    this.#deps = deps;
  }

  async execute<R = unknown>(request: ActionRequest): Promise<ActionResult<R>> {
    const { registry, killSwitch, approval, audit, logger, dryRun } = this.#deps;
    const startedAt = Date.now();

    const refuse = async (
      reason: Parameters<typeof buildRefusal>[1],
      detail: string,
      mutating: boolean,
    ): Promise<ActionResult<R>> => {
      await audit.record({
        kind: request.kind,
        target: request.target,
        mutating,
        outcome: 'refused',
        detail: `${reason}: ${detail}`,
        ...(request.clientSlug !== undefined ? { clientSlug: request.clientSlug } : {}),
        ...(request.requestedBy !== undefined ? { requestedBy: request.requestedBy } : {}),
      });
      logger.warn('ação recusada', {
        kind: request.kind,
        target: request.target,
        reason,
      });
      return buildRefusal(request.kind, reason, detail);
    };

    // 1. Ação registrada?
    const definition = registry.get(request.kind);
    if (definition === undefined) {
      return refuse(
        'unknown_action',
        `Ação "${request.kind}" não está registrada. Toda ação precisa de esquema e classificação declarados.`,
        false,
      );
    }

    // 2. Payload válido?
    const parsed = definition.schema.safeParse(request.payload);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
        .join('; ');
      return refuse('invalid_payload', issues, definition.mutating);
    }

    // 3. Kill switch (só para ações mutantes)
    if (definition.mutating && killSwitch.isEngaged()) {
      return refuse('blocked_by_kill_switch', killSwitch.describe(), true);
    }

    // 4. Aprovação humana (só para ações mutantes)
    if (definition.mutating) {
      const decision = await approval.decide(request, true);
      if (!decision.approved) {
        return refuse('approval_required', decision.reason, true);
      }
    }

    // 5. Execução
    const context: ActionContext = {
      dryRun,
      ...(request.clientSlug !== undefined ? { clientSlug: request.clientSlug } : {}),
      ...(request.requestedBy !== undefined ? { requestedBy: request.requestedBy } : {}),
    };

    try {
      const data = (await definition.handler(parsed.data, context)) as R;
      const durationMs = Date.now() - startedAt;

      // 6. Auditoria do sucesso
      await audit.record({
        kind: request.kind,
        target: request.target,
        mutating: definition.mutating,
        outcome: 'executed',
        detail: dryRun && definition.mutating ? 'executado em dry-run' : 'executado',
        durationMs,
        ...(request.clientSlug !== undefined ? { clientSlug: request.clientSlug } : {}),
        ...(request.requestedBy !== undefined ? { requestedBy: request.requestedBy } : {}),
      });

      logger.info('ação executada', {
        kind: request.kind,
        target: request.target,
        durationMs,
      });

      return { status: 'executed', kind: request.kind, dryRun, data, durationMs };
    } catch (error: unknown) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);

      // 6. Auditoria da falha
      await audit.record({
        kind: request.kind,
        target: request.target,
        mutating: definition.mutating,
        outcome: 'failed',
        detail: message,
        durationMs,
        ...(request.clientSlug !== undefined ? { clientSlug: request.clientSlug } : {}),
        ...(request.requestedBy !== undefined ? { requestedBy: request.requestedBy } : {}),
      });

      logger.error('ação falhou', { kind: request.kind, target: request.target, error });

      return { status: 'failed', kind: request.kind, error: message, durationMs };
    }
  }
}

function buildRefusal(
  kind: string,
  reason:
    | 'unknown_action'
    | 'invalid_payload'
    | 'blocked_by_kill_switch'
    | 'approval_required'
    | 'integration_disabled'
    | 'unverified_target',
  detail: string,
): ActionResult<never> {
  return { status: 'refused', kind, reason, detail };
}
