/**
 * GoogleAdsWriteAdapter — alterações em campanhas, com plano e aprovação.
 *
 * Implementa o fluxo especificado pelo dono:
 *
 *   validate_only → plano → hash da operação → aprovação → execução
 *   → leitura pós-operação → auditoria
 *
 * ## Por que plano + hash, e não execução direta
 *
 * `validateOnly: true` faz o Google validar a operação **sem executar**. O
 * plano devolvido carrega o hash do payload exato que será enviado. Executar
 * exige apresentar esse hash de volta.
 *
 * Isso garante três coisas: você aprova exatamente o que vai rodar; um plano
 * não pode ser reaproveitado para outra operação; e se alguém alterar o
 * payload entre planejar e executar, o hash não bate e a execução é recusada.
 *
 * ## O que continua bloqueado
 *
 * Só existem duas operações: status de campanha e valor de orçamento. Não há
 * criação de campanha, remoção, mudança de lance, de meta de conversão, nem
 * edição de anúncio. E toda operação passa pela allowlist de escopo — a conta
 * é compartilhada entre clientes.
 */

import { createHash } from 'node:crypto';
import { assertAuthorizedCustomer, assertCampaignBelongsTo, assertCampaignMutable } from './scope.js';
import type { GoogleAdsSearchTransport } from './read-adapter.js';

export type MutationKind = 'campaign.status' | 'campaign.budget';

export interface MutationPlan {
  readonly kind: MutationKind;
  readonly customerId: string;
  readonly campaignId: string;
  readonly clientSlug: string;
  /** Descrição legível do que vai acontecer. */
  readonly summary: string;
  readonly before: Record<string, unknown>;
  readonly after: Record<string, unknown>;
  /** Corpo exato que será enviado. */
  readonly payload: unknown;
  readonly endpoint: string;
  /** SHA-256 do payload. Exigido para executar. */
  readonly hash: string;
  /** true = o Google validou com validateOnly e aceitou. */
  readonly validated: boolean;
  readonly validationRequestId: string;
  readonly plannedAt: string;
  readonly financialImpact: string;
}

export interface MutationResult {
  readonly executed: boolean;
  readonly kind: MutationKind;
  readonly campaignId: string;
  readonly hash: string;
  readonly requestId: string;
  readonly executedAt: string;
  readonly response: unknown;
}

export class MutationRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MutationRefusedError';
  }
}

/** Transporte de escrita. Separado do de leitura de propósito. */
export interface GoogleAdsMutateTransport extends GoogleAdsSearchTransport {
  mutate(
    customerId: string,
    endpoint: string,
    payload: unknown,
    validateOnly: boolean,
  ): Promise<{ response: unknown; requestId: string }>;
}

/**
 * Impressão digital do payload para detectar alteração entre planejar e executar.
 *
 * São 64 bits — **integridade contra mudança acidental, não autenticação**. Não
 * é resistente a colisão deliberada, e não precisa ser: quem consegue forjar o
 * payload já está dentro do processo, onde poderia simplesmente chamar o
 * transporte direto. O que este hash impede é o caso real — plano montado,
 * revisado, e alterado no caminho até a aprovação.
 */
function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export interface WriteAdapterOptions {
  readonly transport: GoogleAdsMutateTransport;
  /**
   * Teto de gasto diário aceito em plano de orçamento. Acima disso o plano é
   * recusado — não por regra arbitrária, mas porque orçamento acima do que a
   * campanha comprova conseguir gastar com CPC bom faz o algoritmo comprar
   * clique caro para cumprir a meta.
   */
  readonly maxDailyBudgetBRL: number;
}

export function createGoogleAdsWriteAdapter(options: WriteAdapterOptions) {
  const { transport, maxDailyBudgetBRL } = options;

  /** Lê o estado atual antes de planejar — o "before" precisa ser real. */
  const readCampaign = async (customerId: string, campaignId: string) => {
    const { rows } = await transport.searchStream(
      customerId,
      `SELECT campaign.id, campaign.name, campaign.status,
              campaign_budget.id, campaign_budget.amount_micros,
              campaign_budget.total_amount_micros, campaign_budget.period
       FROM campaign WHERE campaign.id = ${campaignId.replace(/\D/g, '')}`,
    );
    const row = rows[0];
    if (row === undefined) {
      throw new MutationRefusedError(`campanha ${campaignId} não encontrada`);
    }
    return row as Record<string, Record<string, unknown>>;
  };

  return {
    name: 'google-ads-write' as const,

    /** Planeja mudança de status. Não executa. */
    async planCampaignStatus(
      customerId: string,
      campaignId: string,
      clientSlug: string,
      status: 'ENABLED' | 'PAUSED',
    ): Promise<MutationPlan> {
      const cid = assertAuthorizedCustomer(customerId);
      assertCampaignBelongsTo(campaignId, clientSlug);
      assertCampaignMutable(campaignId);

      const current = await readCampaign(cid, campaignId);
      const before = String(current['campaign']?.['status'] ?? 'UNKNOWN');
      if (before === status) {
        throw new MutationRefusedError(`campanha já está ${status}; nada a fazer`);
      }

      const payload = {
        operations: [
          {
            update: { resourceName: `customers/${cid}/campaigns/${campaignId}`, status },
            updateMask: 'status',
          },
        ],
      };
      const endpoint = `customers/${cid}/campaigns:mutate`;
      const v = await transport.mutate(cid, endpoint, { ...payload, validateOnly: true }, true);

      return {
        kind: 'campaign.status',
        customerId: cid,
        campaignId,
        clientSlug,
        summary: `Alterar status da campanha ${campaignId} de ${before} para ${status}`,
        before: { status: before },
        after: { status },
        payload,
        endpoint,
        hash: hashPayload(payload),
        validated: true,
        validationRequestId: v.requestId,
        plannedAt: new Date().toISOString(),
        financialImpact:
          status === 'ENABLED'
            ? 'ATIVA a veiculação: a campanha volta a GASTAR dinheiro real.'
            : 'Interrompe a veiculação. Sem gasto adicional.',
      };
    },

    /** Planeja mudança de orçamento diário. Não executa. */
    async planCampaignBudget(
      customerId: string,
      campaignId: string,
      clientSlug: string,
      dailyBudgetBRL: number,
    ): Promise<MutationPlan> {
      const cid = assertAuthorizedCustomer(customerId);
      assertCampaignBelongsTo(campaignId, clientSlug);
      assertCampaignMutable(campaignId);

      if (!Number.isFinite(dailyBudgetBRL) || dailyBudgetBRL <= 0) {
        throw new MutationRefusedError('orçamento diário inválido');
      }
      if (dailyBudgetBRL > maxDailyBudgetBRL) {
        throw new MutationRefusedError(
          `orçamento diário de R$ ${dailyBudgetBRL.toFixed(2)} excede o teto de ` +
            `R$ ${maxDailyBudgetBRL.toFixed(2)}. Acima do que a campanha comprova gastar com ` +
            'CPC bom, o algoritmo compra clique caro para cumprir a meta.',
        );
      }

      const current = await readCampaign(cid, campaignId);
      const budget = current['campaignBudget'] ?? {};
      const budgetId = String(budget['id'] ?? '');
      if (budgetId === '') throw new MutationRefusedError('orçamento da campanha não encontrado');

      // Descoberto na primeira execução real: esta campanha usa CUSTOM_PERIOD,
      // ou seja, orçamento TOTAL para um intervalo de datas — não um diário.
      // Tentar gravar `amount_micros` num orçamento assim devolve
      // INVALID_ARGUMENT. O campo correto é `total_amount_micros`.
      const isCustomPeriod = String(budget['period'] ?? '') === 'CUSTOM_PERIOD';
      const field = isCustomPeriod ? 'total_amount_micros' : 'amount_micros';
      const beforeMicros = Number(
        isCustomPeriod ? budget['totalAmountMicros'] ?? 0 : budget['amountMicros'] ?? 0,
      );
      const afterMicros = Math.round(dailyBudgetBRL * 1e6);

      if (afterMicros <= beforeMicros && isCustomPeriod) {
        throw new MutationRefusedError(
          `orçamento total já é R$ ${(beforeMicros / 1e6).toFixed(2)}; ` +
            `reduzir para R$ ${dailyBudgetBRL.toFixed(2)} não é suportado por este fluxo`,
        );
      }

      const payload = {
        operations: [
          {
            update: {
              resourceName: `customers/${cid}/campaignBudgets/${budgetId}`,
              ...(isCustomPeriod
                ? { totalAmountMicros: String(afterMicros) }
                : { amountMicros: String(afterMicros) }),
            },
            updateMask: field,
          },
        ],
      };
      const endpoint = `customers/${cid}/campaignBudgets:mutate`;
      const v = await transport.mutate(cid, endpoint, { ...payload, validateOnly: true }, true);

      return {
        kind: 'campaign.budget',
        customerId: cid,
        campaignId,
        clientSlug,
        summary:
          `Alterar orçamento ${isCustomPeriod ? 'TOTAL do período' : 'diário'} da campanha ` +
          `${campaignId} de R$ ${(beforeMicros / 1e6).toFixed(2)} para ` +
          `R$ ${dailyBudgetBRL.toFixed(2)}`,
        before: { budgetBRL: beforeMicros / 1e6, budgetId, period: budget['period'] ?? 'DAILY' },
        after: { budgetBRL: dailyBudgetBRL },
        payload,
        endpoint,
        hash: hashPayload(payload),
        validated: true,
        validationRequestId: v.requestId,
        plannedAt: new Date().toISOString(),
        financialImpact: isCustomPeriod
          ? `Passa a permitir gasto de até R$ ${dailyBudgetBRL.toFixed(2)} NO TOTAL do período ` +
            `(já gastou R$ ${(beforeMicros / 1e6).toFixed(2)} do limite anterior). ` +
            'Alterar orçamento pode REINICIAR a fase de aprendizado.'
          : `Passa a permitir gasto de até R$ ${dailyBudgetBRL.toFixed(2)} por dia. ` +
            'Alterar orçamento pode REINICIAR a fase de aprendizado.',
      };
    },

    /**
     * Executa um plano. Exige o hash de volta.
     *
     * O hash é recalculado do payload no momento da execução: se o plano
     * tiver sido alterado depois de aprovado, os hashes divergem e a
     * execução é recusada.
     */
    async execute(plan: MutationPlan, approvedHash: string): Promise<MutationResult> {
      if (!plan.validated) {
        throw new MutationRefusedError('plano não validado pelo Google; não pode ser executado');
      }
      const recomputed = hashPayload(plan.payload);
      if (recomputed !== plan.hash) {
        throw new MutationRefusedError(
          'o plano foi alterado depois de criado — hash não confere. Execução recusada.',
        );
      }
      if (approvedHash.trim().toLowerCase() !== plan.hash) {
        throw new MutationRefusedError(
          `hash de aprovação não confere. Esperado ${plan.hash}, recebido ${approvedHash}.`,
        );
      }

      const r = await transport.mutate(plan.customerId, plan.endpoint, plan.payload, false);
      return {
        executed: true,
        kind: plan.kind,
        campaignId: plan.campaignId,
        hash: plan.hash,
        requestId: r.requestId,
        executedAt: new Date().toISOString(),
        response: r.response,
      };
    },
  };
}
