/**
 * GoogleAdsReadAdapter — leitura ao vivo do Google Ads.
 *
 * **Somente leitura, por construção.** Não existe método de escrita nesta
 * interface. Não é uma flag que alguém desliga: `create`, `update`, `remove`,
 * `pause`, `enable`, `mutate`, mudança de orçamento, de estratégia de lance e
 * de meta de conversão simplesmente não têm ponto de entrada aqui.
 *
 * `writeActionsEnabled` é `false as const` — tipo literal, não booleano. Um
 * `.env` não alcança isto; mudar exige editar código e passar por revisão.
 *
 * ## Três garantias que o adaptador impõe
 *
 * 1. **Escopo.** Toda consulta passa por `assertAuthorizedCustomer` e pela
 *    allowlist de campanha. A conta `2656966896` é compartilhada entre
 *    clientes — sem essa checagem, um ID errado traz dado do cliente errado.
 * 2. **Procedência temporal.** Todo resultado carrega `fetchedAt` e
 *    `requestId`. Dado sem esses campos não é dado ao vivo, e o tipo obriga a
 *    presença deles.
 * 3. **Falha fechada.** Sem credencial, sem API, ou com erro de rede, o
 *    adaptador **lança**. Nunca devolve valor histórico como se fosse atual.
 */

import type { GoogleAdsCredentialStatus } from './credential-provider.js';
import {
  assertAuthorizedCustomer,
  assertCampaignBelongsTo,
  assertAuthorizedCampaign,
  AUTHORIZED_CUSTOMER_ID,
  AUTHORIZED_LOGIN_CUSTOMER_ID,
} from './scope.js';

/** Envelope obrigatório de toda leitura ao vivo. */
export interface LiveResult<T> {
  readonly data: T;
  /** ISO 8601 do momento da consulta. */
  readonly fetchedAt: string;
  /** Request ID sanitizado devolvido pela API, para auditoria. */
  readonly requestId: string;
  readonly apiVersion: string;
  readonly customerId: string;
}

export interface AccountSummary {
  readonly customerId: string;
  readonly descriptiveName: string | null;
  readonly currencyCode: string | null;
  readonly timeZone: string | null;
  readonly isManager: boolean;
}

export interface CampaignSummary {
  readonly campaignId: string;
  readonly name: string;
  readonly status: string;
  readonly primaryStatus: string | null;
  readonly primaryStatusReasons: readonly string[];
  readonly biddingStrategyType: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly clientSlug: string;
}

export interface CampaignBudget {
  readonly budgetId: string;
  readonly amountMicros: number;
  readonly deliveryMethod: string | null;
}

export interface DailyMetrics {
  readonly date: string;
  readonly costMicros: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly averageCpcMicros: number;
  readonly conversions: number;
}

export interface ConversionBreakdown {
  readonly actionName: string;
  readonly category: string;
  readonly conversions: number;
  /**
   * Marcado explicitamente. Clique em WhatsApp é MICROconversão: barata e
   * frequente. Somá-la a lead qualificado infla o número e esconde o custo
   * real por lead. O tipo obriga a decisão em vez de deixar implícito.
   */
  readonly isMicroConversion: boolean;
  readonly lastConversionDate: string | null;
}

export interface ChangeHistoryEntry {
  readonly changeDateTime: string;
  readonly changeResourceType: string;
  readonly clientType: string | null;
  readonly userEmail: string | null;
  readonly changedFields: readonly string[];
}

export interface AdPolicyStatus {
  readonly adId: string;
  readonly adGroupId: string;
  readonly status: string;
  readonly approvalStatus: string | null;
  readonly policyTopics: readonly string[];
}

/**
 * Transporte para a API. Isolado atrás de interface para que o adaptador seja
 * testável sem rede e sem credencial — e para que a implementação real possa
 * reaproveitar o cliente já validado do projeto anterior.
 */
export interface GoogleAdsSearchTransport {
  readonly apiVersion: string;
  /** GAQL somente leitura. Implementação deve recusar qualquer coisa que não seja SELECT. */
  searchStream(
    customerId: string,
    query: string,
  ): Promise<{ rows: readonly Record<string, unknown>[]; requestId: string }>;
  listAccessibleCustomers(): Promise<{ resourceNames: readonly string[]; requestId: string }>;
}

export class GoogleAdsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAdsUnavailableError';
  }
}

/**
 * Recusa qualquer GAQL que não seja leitura.
 *
 * Defesa em profundidade: a interface já não expõe mutate, mas uma query é
 * texto livre, e texto livre é onde escrita entraria disfarçada.
 */
const FORBIDDEN_GAQL = /\b(INSERT|UPDATE|DELETE|REMOVE|CREATE|MUTATE|SET)\b/i;

export function assertReadOnlyQuery(query: string): string {
  const trimmed = query.trim();
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error('GAQL recusado: toda consulta precisa começar com SELECT.');
  }
  if (FORBIDDEN_GAQL.test(trimmed)) {
    throw new Error('GAQL recusado: contém verbo de escrita.');
  }
  return trimmed;
}

export interface GoogleAdsReadAdapter {
  readonly name: 'google-ads';
  readonly enabled: boolean;
  /** Tipo literal. Não é configurável. */
  readonly writeActionsEnabled: false;

  listAccessibleCustomers(): Promise<LiveResult<readonly string[]>>;
  getAccountSummary(customerId: string): Promise<LiveResult<AccountSummary>>;
  listCampaigns(customerId: string): Promise<LiveResult<readonly CampaignSummary[]>>;
  getCampaign(customerId: string, campaignId: string, clientSlug: string): Promise<LiveResult<CampaignSummary>>;
  getCampaignBudget(customerId: string, campaignId: string, clientSlug: string): Promise<LiveResult<CampaignBudget>>;
  getCampaignDailyMetrics(
    customerId: string,
    campaignId: string,
    clientSlug: string,
    range: { since: string; until: string },
  ): Promise<LiveResult<readonly DailyMetrics[]>>;
  getCampaignConversions(customerId: string, campaignId: string, clientSlug: string): Promise<LiveResult<readonly ConversionBreakdown[]>>;
  getCampaignChangeHistory(customerId: string, campaignId: string, clientSlug: string): Promise<LiveResult<readonly ChangeHistoryEntry[]>>;
  getConversionActions(customerId: string): Promise<LiveResult<readonly ConversionBreakdown[]>>;
  getAdsAndPolicyStatus(customerId: string, campaignId: string, clientSlug: string): Promise<LiveResult<readonly AdPolicyStatus[]>>;
  findCampaignByExactName(customerId: string, exactName: string): Promise<LiveResult<CampaignSummary | null>>;
}

/** Nomes de ação de conversão tratados como microconversão. */
const MICRO_CONVERSION_PATTERNS = [/whats\s*app/i, /clique.*whats/i, /message/i, /chat/i];

export function isMicroConversion(actionName: string): boolean {
  return MICRO_CONVERSION_PATTERNS.some((p) => p.test(actionName));
}

export function createGoogleAdsReadAdapter(deps: {
  readonly credentials: GoogleAdsCredentialStatus;
  readonly transport: GoogleAdsSearchTransport | null;
}): GoogleAdsReadAdapter {
  const { credentials, transport } = deps;
  const enabled = credentials.authMode !== 'unavailable' && transport !== null;

  /** Falha fechada: sem credencial ou sem transporte, lança. Nunca devolve histórico. */
  const requireTransport = (): GoogleAdsSearchTransport => {
    if (transport === null || credentials.authMode === 'unavailable') {
      throw new GoogleAdsUnavailableError(
        `Google Ads indisponível (authMode=${credentials.authMode}). ` +
          `${credentials.unavailableReason ?? ''} ` +
          'Nenhum dado histórico será devolvido no lugar de leitura ao vivo.',
      );
    }
    return transport;
  };

  const run = async <T>(
    customerId: string,
    query: string,
    map: (rows: readonly Record<string, unknown>[]) => T,
  ): Promise<LiveResult<T>> => {
    const t = requireTransport();
    const scoped = assertAuthorizedCustomer(customerId);
    const safeQuery = assertReadOnlyQuery(query);
    const { rows, requestId } = await t.searchStream(scoped, safeQuery);
    return {
      data: map(rows),
      fetchedAt: new Date().toISOString(),
      requestId,
      apiVersion: t.apiVersion,
      customerId: scoped,
    };
  };

  return {
    name: 'google-ads',
    enabled,
    writeActionsEnabled: false,

    async listAccessibleCustomers() {
      const t = requireTransport();
      const { resourceNames, requestId } = await t.listAccessibleCustomers();
      return {
        data: resourceNames,
        fetchedAt: new Date().toISOString(),
        requestId,
        apiVersion: t.apiVersion,
        customerId: AUTHORIZED_LOGIN_CUSTOMER_ID,
      };
    },

    getAccountSummary: (customerId) =>
      run(
        customerId,
        `SELECT customer.id, customer.descriptive_name, customer.currency_code,
                customer.time_zone, customer.manager
         FROM customer LIMIT 1`,
        (rows) => {
          const c = (rows[0]?.['customer'] ?? {}) as Record<string, unknown>;
          return {
            customerId: String(c['id'] ?? AUTHORIZED_CUSTOMER_ID),
            descriptiveName: str(c['descriptive_name']),
            currencyCode: str(c['currency_code']),
            timeZone: str(c['time_zone']),
            isManager: c['manager'] === true,
          };
        },
      ),

    listCampaigns: (customerId) =>
      run(
        customerId,
        `SELECT campaign.id, campaign.name, campaign.status,
                campaign.primary_status, campaign.primary_status_reasons,
                campaign.bidding_strategy_type, campaign.start_date, campaign.end_date
         FROM campaign`,
        (rows) => rows.map(toCampaign),
      ),

    getCampaign: (customerId, campaignId, clientSlug) => {
      assertCampaignBelongsTo(campaignId, clientSlug);
      return run(
        customerId,
        `SELECT campaign.id, campaign.name, campaign.status,
                campaign.primary_status, campaign.primary_status_reasons,
                campaign.bidding_strategy_type, campaign.start_date, campaign.end_date
         FROM campaign WHERE campaign.id = ${numeric(campaignId)}`,
        (rows) => toCampaign(rows[0] ?? {}),
      );
    },

    getCampaignBudget: (customerId, campaignId, clientSlug) => {
      assertCampaignBelongsTo(campaignId, clientSlug);
      return run(
        customerId,
        `SELECT campaign_budget.id, campaign_budget.amount_micros,
                campaign_budget.delivery_method
         FROM campaign_budget WHERE campaign.id = ${numeric(campaignId)}`,
        (rows) => {
          const b = (rows[0]?.['campaign_budget'] ?? {}) as Record<string, unknown>;
          return {
            budgetId: String(b['id'] ?? ''),
            amountMicros: num(b['amount_micros']),
            deliveryMethod: str(b['delivery_method']),
          };
        },
      );
    },

    getCampaignDailyMetrics: (customerId, campaignId, clientSlug, range) => {
      assertCampaignBelongsTo(campaignId, clientSlug);
      return run(
        customerId,
        `SELECT segments.date, metrics.cost_micros, metrics.impressions,
                metrics.clicks, metrics.average_cpc, metrics.conversions
         FROM campaign
         WHERE campaign.id = ${numeric(campaignId)}
           AND segments.date BETWEEN '${isoDate(range.since)}' AND '${isoDate(range.until)}'`,
        (rows) =>
          rows.map((r) => {
            const m = (r['metrics'] ?? {}) as Record<string, unknown>;
            const s = (r['segments'] ?? {}) as Record<string, unknown>;
            return {
              date: str(s['date']) ?? '',
              costMicros: num(m['cost_micros']),
              impressions: num(m['impressions']),
              clicks: num(m['clicks']),
              averageCpcMicros: num(m['average_cpc']),
              conversions: num(m['conversions']),
            };
          }),
      );
    },

    getCampaignConversions: (customerId, campaignId, clientSlug) => {
      assertCampaignBelongsTo(campaignId, clientSlug);
      return run(
        customerId,
        `SELECT segments.conversion_action_name, segments.conversion_action_category,
                metrics.conversions, segments.date
         FROM campaign WHERE campaign.id = ${numeric(campaignId)}`,
        (rows) => rows.map(toConversion),
      );
    },

    getCampaignChangeHistory: (customerId, campaignId, clientSlug) => {
      assertCampaignBelongsTo(campaignId, clientSlug);
      return run(
        customerId,
        `SELECT change_event.change_date_time, change_event.change_resource_type,
                change_event.client_type, change_event.user_email,
                change_event.changed_fields
         FROM change_event WHERE campaign.id = ${numeric(campaignId)}`,
        (rows) =>
          rows.map((r) => {
            const e = (r['change_event'] ?? {}) as Record<string, unknown>;
            return {
              changeDateTime: str(e['change_date_time']) ?? '',
              changeResourceType: str(e['change_resource_type']) ?? '',
              clientType: str(e['client_type']),
              userEmail: str(e['user_email']),
              changedFields: Array.isArray(e['changed_fields'])
                ? (e['changed_fields'] as unknown[]).map((f) => String(f))
                : [],
            };
          }),
      );
    },

    getConversionActions: (customerId) =>
      run(
        customerId,
        `SELECT conversion_action.name, conversion_action.category,
                conversion_action.status
         FROM conversion_action`,
        (rows) =>
          rows.map((r) => {
            const a = (r['conversion_action'] ?? {}) as Record<string, unknown>;
            const name = str(a['name']) ?? '';
            return {
              actionName: name,
              category: str(a['category']) ?? '',
              conversions: 0,
              isMicroConversion: isMicroConversion(name),
              lastConversionDate: null,
            };
          }),
      ),

    getAdsAndPolicyStatus: (customerId, campaignId, clientSlug) => {
      assertCampaignBelongsTo(campaignId, clientSlug);
      return run(
        customerId,
        `SELECT ad_group_ad.ad.id, ad_group.id, ad_group_ad.status,
                ad_group_ad.policy_summary.approval_status,
                ad_group_ad.policy_summary.policy_topic_entries
         FROM ad_group_ad WHERE campaign.id = ${numeric(campaignId)}`,
        (rows) =>
          rows.map((r) => {
            const aga = (r['ad_group_ad'] ?? {}) as Record<string, unknown>;
            const ad = (aga['ad'] ?? {}) as Record<string, unknown>;
            const ps = (aga['policy_summary'] ?? {}) as Record<string, unknown>;
            const ag = (r['ad_group'] ?? {}) as Record<string, unknown>;
            return {
              adId: String(ad['id'] ?? ''),
              adGroupId: String(ag['id'] ?? ''),
              status: str(aga['status']) ?? '',
              approvalStatus: str(ps['approval_status']),
              policyTopics: Array.isArray(ps['policy_topic_entries'])
                ? (ps['policy_topic_entries'] as Record<string, unknown>[]).map((t) =>
                    String(t['topic'] ?? ''),
                  )
                : [],
            };
          }),
      );
    },

    /** Correspondência EXATA — o Buteco Sertanejo precisa ser achado pelo nome literal. */
    findCampaignByExactName: (customerId, exactName) =>
      run(
        customerId,
        `SELECT campaign.id, campaign.name, campaign.status,
                campaign.primary_status, campaign.primary_status_reasons,
                campaign.bidding_strategy_type, campaign.start_date, campaign.end_date
         FROM campaign WHERE campaign.name = '${escapeGaql(exactName)}'`,
        (rows) => (rows.length === 0 ? null : toCampaign(rows[0] ?? {})),
      ),
  };
}

// --- utilitários -------------------------------------------------------------

function toCampaign(row: Record<string, unknown>): CampaignSummary {
  const c = (row['campaign'] ?? {}) as Record<string, unknown>;
  const id = String(c['id'] ?? '');
  let clientSlug = 'unknown';
  try {
    clientSlug = assertAuthorizedCampaign(id).clientSlug;
  } catch {
    // Campanha fora da allowlist aparecendo numa listagem ampla: identificada
    // como desconhecida em vez de atribuída ao cliente errado por engano.
  }
  return {
    campaignId: id,
    name: str(c['name']) ?? '',
    status: str(c['status']) ?? '',
    primaryStatus: str(c['primary_status']),
    primaryStatusReasons: Array.isArray(c['primary_status_reasons'])
      ? (c['primary_status_reasons'] as unknown[]).map((r) => String(r))
      : [],
    biddingStrategyType: str(c['bidding_strategy_type']),
    startDate: str(c['start_date']),
    endDate: str(c['end_date']),
    clientSlug,
  };
}

function toConversion(row: Record<string, unknown>): ConversionBreakdown {
  const s = (row['segments'] ?? {}) as Record<string, unknown>;
  const m = (row['metrics'] ?? {}) as Record<string, unknown>;
  const name = str(s['conversion_action_name']) ?? '';
  return {
    actionName: name,
    category: str(s['conversion_action_category']) ?? '',
    conversions: num(m['conversions']),
    isMicroConversion: isMicroConversion(name),
    lastConversionDate: str(s['date']),
  };
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}
/** Só dígitos entram na query: fecha interpolação de GAQL. */
function numeric(v: string): string {
  const d = v.replace(/\D/g, '');
  if (d === '') throw new Error('identificador numérico inválido');
  return d;
}
function isoDate(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`data inválida: ${v}`);
  return v;
}
function escapeGaql(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
