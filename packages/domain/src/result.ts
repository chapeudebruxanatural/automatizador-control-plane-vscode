/**
 * Resultado de uma ação.
 *
 * `refused` é deliberadamente distinto de `failed`. Uma recusa é o sistema
 * funcionando: o freio segurou. Uma falha é o sistema tentando e não
 * conseguindo. Tratar os dois como "erro" esconderia justamente o sinal mais
 * útil — uma automação tentando escrever antes da hora.
 */

export const REFUSAL_REASONS = [
  /** Ação não registrada. Não existe execução anônima. */
  'unknown_action',
  /** Payload não passou no esquema. */
  'invalid_payload',
  /** Kill switch acionado e a ação é mutante. */
  'blocked_by_kill_switch',
  /** Falta aprovação humana. */
  'approval_required',
  /** Integração ainda não habilitada nesta fase. */
  'integration_disabled',
  /** Recurso pertence a cliente cuja procedência não permite agir. */
  'unverified_target',
] as const;

export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export interface ActionExecuted<R = unknown> {
  readonly status: 'executed';
  readonly kind: string;
  readonly dryRun: boolean;
  readonly data: R;
  readonly durationMs: number;
}

export interface ActionRefused {
  readonly status: 'refused';
  readonly kind: string;
  readonly reason: RefusalReason;
  readonly detail: string;
}

export interface ActionFailed {
  readonly status: 'failed';
  readonly kind: string;
  readonly error: string;
  readonly durationMs: number;
}

export type ActionResult<R = unknown> = ActionExecuted<R> | ActionRefused | ActionFailed;

export function isExecuted<R>(result: ActionResult<R>): result is ActionExecuted<R> {
  return result.status === 'executed';
}

export function isRefused(result: ActionResult): result is ActionRefused {
  return result.status === 'refused';
}

export function isFailed(result: ActionResult): result is ActionFailed {
  return result.status === 'failed';
}
