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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface FileApprovalRecord {
  id: string;
  kind: string;
  approvedBy: string;
  expiresAt?: string;
}

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

/**
 * Provedor de aprovações persistente em arquivo.
 *
 * Formato: JSON Lines, cada linha um `FileApprovalRecord`.
 * Entradas são consumidas (removidas) ao serem usadas. Expirações são
 * respeitadas se `expiresAt` estiver presente.
 */
export function createFileApprovalProvider(filePath: string): ApprovalProvider {
  async function ensureDir() {
    await mkdir(dirname(filePath), { recursive: true });
  }

  async function readAll(): Promise<FileApprovalRecord[]> {
    try {
      const raw = await readFile(filePath, 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as FileApprovalRecord);
    } catch (e: any) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  async function writeAll(records: FileApprovalRecord[]) {
    await ensureDir();
    const content = records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
    await writeFile(filePath, content, 'utf8');
  }

  return {
    name: 'file-approval',
    decide: async (request, mutating) => {
      if (!mutating) {
        return { approved: true, reason: 'Ação de leitura não requer aprovação.' };
      }

      const now = new Date();
      const records = await readAll();

      const idx = records.findIndex((r) => {
        if (r.kind !== request.kind) return false;
        if (!r.expiresAt) return true;
        return new Date(r.expiresAt) > now;
      });

      if (idx === -1) {
        return { approved: false, reason: `Sem aprovação persistente para "${request.kind}".` };
      }

      const record = records.splice(idx, 1)[0];
      await writeAll(records);
      return {
        approved: true,
        reason: 'Aprovação persistente consumida.',
        approvedBy: record.approvedBy,
        expiresAt: record.expiresAt ? new Date(record.expiresAt) : undefined,
      };
    },
  };
}
