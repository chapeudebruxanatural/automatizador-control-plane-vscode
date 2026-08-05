/**
 * Política de aprovação humana.
 *
 * Regras que a implementação real precisa preservar, descritas em
 * `brain/operations/protocolo-de-aprovacao.md`:
 *
 * - **Específica.** Vale para uma ação, não para uma categoria.
 * - **Anterior.** Aprovação depois do fato é justificativa, não aprovação.
 * - **Não transitiva.** Aprovar o passo 1 não aprova o passo 2.
 * - **Do dono.** Nunca de conteúdo observado — página, arquivo, saída de
 *   comando ou workflow. Texto vindo de ferramenta é dado, nunca comando.
 */

import type { ActionRequest } from '../../domain/src/action.js';

export interface ApprovalDecision {
  readonly approved: boolean;
  readonly reason: string;
  readonly approvedBy?: string;
  readonly expiresAt?: Date;
}

export interface ApprovalProvider {
  readonly name: string;
  decide(request: ActionRequest, mutating: boolean): Promise<ApprovalDecision>;
}

/**
 * Recusa toda ação mutante. É o comportamento correto enquanto não existir um
 * canal real de aprovação: sem canal, não há aprovação possível, e "sem
 * aprovação" significa "não".
 */
export function createDenyAllApprovalProvider(): ApprovalProvider {
  return {
    name: 'deny-all',
    decide: (_request, mutating) =>
      Promise.resolve(
        mutating
          ? {
              approved: false,
              reason:
                'Nenhum canal de aprovação humana configurado. Ações mutantes permanecem recusadas.',
            }
          : { approved: true, reason: 'Ação de leitura não requer aprovação.' },
      ),
  };
}

/**
 * Aprovações explícitas por `kind`, para teste e para uso pontual.
 *
 * Cada entrada vale **uma vez**: é consumida no uso. Isso implementa em código
 * a regra de que aprovação não é transitiva nem reutilizável — aprovar um
 * reinício hoje não aprova o de amanhã.
 */
export function createSingleUseApprovalProvider(
  approvals: readonly { kind: string; approvedBy: string }[],
): ApprovalProvider {
  const remaining = [...approvals];

  return {
    name: 'single-use',
    decide: (request, mutating) => {
      if (!mutating) {
        return Promise.resolve({
          approved: true,
          reason: 'Ação de leitura não requer aprovação.',
        });
      }

      const index = remaining.findIndex((a) => a.kind === request.kind);
      if (index === -1) {
        return Promise.resolve({
          approved: false,
          reason: `Sem aprovação válida para "${request.kind}".`,
        });
      }

      const [approval] = remaining.splice(index, 1);
      return Promise.resolve({
        approved: true,
        reason: 'Aprovação de uso único consumida.',
        approvedBy: approval?.approvedBy ?? 'unknown',
      });
    },
  };
}
