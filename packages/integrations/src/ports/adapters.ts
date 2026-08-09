/**
 * Portas de integração.
 *
 * Cada sistema externo é uma interface aqui e uma implementação em
 * `../adapters/`. GitHub, VPS e Cloudflare possuem implementações reais
 * exclusivamente de leitura; as demais continuam simuladas ou bloqueadas.
 *
 * Convenções que valem para todas as portas:
 *
 * - Métodos que começam com `list`/`get` são leitura e nunca mudam estado.
 * - Métodos mutantes são declarados, mas só podem ser alcançados por uma ação
 *   registrada como `mutating: true` — e portanto passam pelo kill switch.
 * - Nenhum método recebe ou devolve credencial. Segredos vêm do
 *   `SecretProvider`, no momento do uso, e nunca são registrados.
 */

import type { VerificationStatus } from '../../../domain/src/verification.js';

export interface AdapterHealth {
  readonly reachable: boolean;
  readonly detail: string;
  readonly checkedAt: string;
}

/** Base comum: toda porta sabe se está habilitada e se responde. */
export interface IntegrationAdapter {
  readonly name: string;
  /** `true` apenas quando a implementação real de leitura foi injetada. */
  readonly enabled: boolean;
  health(): Promise<AdapterHealth>;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export interface RepositorySummary {
  readonly name: string;
  readonly url: string;
  readonly visibility: 'public' | 'private';
  readonly defaultBranch: string;
  readonly primaryLanguage: string | null;
  readonly updatedAt: string;
  readonly likelyClient: string | null;
  readonly verificationStatus: VerificationStatus;
}

export interface GitHubAdapter extends IntegrationAdapter {
  readonly name: 'github';
  listRepositories(owner: string): Promise<readonly RepositorySummary[]>;
  getRepository(owner: string, repo: string): Promise<RepositorySummary | null>;
}

// ---------------------------------------------------------------------------
// VPS
// ---------------------------------------------------------------------------

export interface ContainerSummary {
  readonly name: string;
  readonly image: string;
  readonly state: string;
  readonly stack: string | null;
  readonly healthy: boolean | null;
}

export interface HostSummary {
  readonly hostname: string;
  readonly os: string;
  readonly uptimeDays: number;
  readonly memoryTotalMb: number;
  readonly memoryAvailableMb: number;
  readonly diskUsagePercent: number;
}

/**
 * O adaptador real deve operar com **lista branca** de comandos, não lista
 * negra. Lista branca falha fechada: o que não foi previsto é recusado. Lista
 * negra falha aberta: o que não foi previsto passa.
 */
export interface VpsAdapter extends IntegrationAdapter {
  readonly name: 'vps';
  getHost(): Promise<HostSummary>;
  listContainers(): Promise<readonly ContainerSummary[]>;
  listStacks(): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// n8n
// ---------------------------------------------------------------------------

export interface WorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly isArchived: boolean;
  readonly updatedAt: string;
  readonly clientSlug: string | null;
}

export interface N8nAdapter extends IntegrationAdapter {
  readonly name: 'n8n';
  listWorkflows(): Promise<readonly WorkflowSummary[]>;
  getWorkflow(id: string): Promise<WorkflowSummary | null>;
  /**
   * Nunca devolve valores de credencial — apenas nome, tipo e a informação de
   * que ela existe.
   */
  listCredentialNames(): Promise<readonly { id: string; name: string; type: string }[]>;
}

// ---------------------------------------------------------------------------
// Cloudflare
// ---------------------------------------------------------------------------

export interface ZoneSummary {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

export interface DnsRecordSummary {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly proxied: boolean;
}

export interface CloudflareAdapter extends IntegrationAdapter {
  readonly name: 'cloudflare';
  listZones(): Promise<readonly ZoneSummary[]>;
  listDnsRecords(zoneId: string): Promise<readonly DnsRecordSummary[]>;
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

export const GOOGLE_ACCOUNTS = {
  /** Conta administrativa canônica da AutomatizadorIA. */
  automatizadoria: 'contato.automatizadoria@gmail.com',
  /** Conta separada dos projetos Novacena. */
  novacena: 'estudionovacena@gmail.com',
} as const;

export type GoogleAccountKey = keyof typeof GOOGLE_ACCOUNTS;

export interface MessageSummary {
  readonly id: string;
  readonly subject: string;
  readonly from: string;
  readonly receivedAt: string;
}

export interface DriveFileSummary {
  readonly id: string;
  readonly title: string;
  readonly mimeType: string;
  readonly owner: string;
  readonly modifiedAt: string;
}

export interface CalendarEventSummary {
  readonly id: string;
  readonly summary: string;
  readonly start: string;
  readonly end: string;
}

/**
 * A conta é **parâmetro obrigatório** de toda operação, e não configuração
 * global. Isso torna impossível escrever uma chamada sem decidir sobre qual
 * conta ela age.
 *
 * A implementação real deve **recusar** qualquer operação que envolva as duas
 * contas na mesma ação. A separação entre AutomatizadorIA e Novacena é regra de
 * negócio, não convenção de uso — ver `docs/security/access-matrix.md`.
 */
export interface GoogleAdapter extends IntegrationAdapter {
  readonly name: 'google';
  listMessages(account: GoogleAccountKey, query: string): Promise<readonly MessageSummary[]>;
  listDriveFiles(account: GoogleAccountKey, query: string): Promise<readonly DriveFileSummary[]>;
  listCalendarEvents(
    account: GoogleAccountKey,
    calendarId: string,
  ): Promise<readonly CalendarEventSummary[]>;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export interface AdAccountSummary {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly currency: string;
  readonly queryable: boolean;
}

export interface CampaignSummary {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly dailyBudgetCents: number | null;
}

export interface MetaAdapter extends IntegrationAdapter {
  readonly name: 'meta';
  listAdAccounts(): Promise<readonly AdAccountSummary[]>;
  listCampaigns(adAccountId: string): Promise<readonly CampaignSummary[]>;
  /** Mutante: gasta verba real. Sempre Nível 2 de aprovação. */
  pauseCampaign(campaignId: string): Promise<{ readonly paused: boolean }>;
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/**
 * **Desligado nesta fase por decisão** — ver `DECISIONS.md`.
 *
 * É o único canal que fala diretamente com o cliente final: um erro é público,
 * imediato e irreversível. A interface existe para que o desenho já contemple
 * o canal; a implementação real não existe, e a simulada recusa tudo.
 *
 * A capacidade, no entanto, já existe fora deste projeto: há uma Evolution API
 * rodando na VPS há meses. Ver `inventory/integrations.yaml`.
 */
export interface WhatsAppAdapter extends IntegrationAdapter {
  readonly name: 'whatsapp';
  readonly enabled: false;
  sendMessage(to: string, body: string): Promise<never>;
}
