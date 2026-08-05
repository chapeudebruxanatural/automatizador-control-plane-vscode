/**
 * Implementações simuladas de todas as portas.
 *
 * São honestas de propósito: devolvem conjuntos vazios e declaram
 * `enabled: false`, em vez de fabricar dados plausíveis. Mock que inventa dado
 * realista cria confiança falsa — alguém lê a resposta, acredita, e decide.
 *
 * Os métodos mutantes lançam. Se um deles for alcançado, houve falha na cadeia
 * de proteção antes dele, e o correto é falhar ruidosamente.
 */

import type {
  AdapterHealth,
  AdAccountSummary,
  CalendarEventSummary,
  CampaignSummary,
  CloudflareAdapter,
  ContainerSummary,
  DnsRecordSummary,
  DriveFileSummary,
  GitHubAdapter,
  GoogleAccountKey,
  GoogleAdapter,
  HostSummary,
  MessageSummary,
  MetaAdapter,
  N8nAdapter,
  RepositorySummary,
  VpsAdapter,
  WhatsAppAdapter,
  WorkflowSummary,
  ZoneSummary,
} from '../ports/adapters.js';

const NOT_IMPLEMENTED =
  'Adaptador simulado: nenhuma integração externa está habilitada nesta fase.';

function health(name: string): Promise<AdapterHealth> {
  return Promise.resolve({
    reachable: false,
    detail: `${name}: adaptador simulado, sem conexão real.`,
    checkedAt: new Date().toISOString(),
  });
}

export function createMockGitHubAdapter(): GitHubAdapter {
  return {
    name: 'github',
    enabled: false,
    health: () => health('github'),
    listRepositories: (_owner: string): Promise<readonly RepositorySummary[]> =>
      Promise.resolve([]),
    getRepository: (_owner: string, _repo: string): Promise<RepositorySummary | null> =>
      Promise.resolve(null),
  };
}

export function createMockVpsAdapter(): VpsAdapter {
  return {
    name: 'vps',
    enabled: false,
    health: () => health('vps'),
    getHost: (): Promise<HostSummary> => Promise.reject(new Error(NOT_IMPLEMENTED)),
    listContainers: (): Promise<readonly ContainerSummary[]> => Promise.resolve([]),
    listStacks: (): Promise<readonly string[]> => Promise.resolve([]),
  };
}

export function createMockN8nAdapter(): N8nAdapter {
  return {
    name: 'n8n',
    enabled: false,
    health: () => health('n8n'),
    listWorkflows: (): Promise<readonly WorkflowSummary[]> => Promise.resolve([]),
    getWorkflow: (_id: string): Promise<WorkflowSummary | null> => Promise.resolve(null),
    listCredentialNames: () => Promise.resolve([]),
  };
}

export function createMockCloudflareAdapter(): CloudflareAdapter {
  return {
    name: 'cloudflare',
    enabled: false,
    health: () => health('cloudflare'),
    listZones: (): Promise<readonly ZoneSummary[]> => Promise.resolve([]),
    listDnsRecords: (_zoneId: string): Promise<readonly DnsRecordSummary[]> =>
      Promise.resolve([]),
  };
}

export function createMockGoogleAdapter(): GoogleAdapter {
  return {
    name: 'google',
    enabled: false,
    health: () => health('google'),
    listMessages: (
      _account: GoogleAccountKey,
      _query: string,
    ): Promise<readonly MessageSummary[]> => Promise.resolve([]),
    listDriveFiles: (
      _account: GoogleAccountKey,
      _query: string,
    ): Promise<readonly DriveFileSummary[]> => Promise.resolve([]),
    listCalendarEvents: (
      _account: GoogleAccountKey,
      _calendarId: string,
    ): Promise<readonly CalendarEventSummary[]> => Promise.resolve([]),
  };
}

export function createMockMetaAdapter(): MetaAdapter {
  return {
    name: 'meta',
    enabled: false,
    health: () => health('meta'),
    listAdAccounts: (): Promise<readonly AdAccountSummary[]> => Promise.resolve([]),
    listCampaigns: (_adAccountId: string): Promise<readonly CampaignSummary[]> =>
      Promise.resolve([]),
    pauseCampaign: (_campaignId: string) => Promise.reject(new Error(NOT_IMPLEMENTED)),
  };
}

/**
 * Recusa envio de forma incondicional, e o tipo de retorno `never` faz o
 * compilador concordar: não existe caminho em que uma mensagem seja enviada.
 */
export function createMockWhatsAppAdapter(): WhatsAppAdapter {
  return {
    name: 'whatsapp',
    enabled: false,
    health: () =>
      Promise.resolve({
        reachable: false,
        detail: 'whatsapp: desligado por decisão desta fase. Ver DECISIONS.md.',
        checkedAt: new Date().toISOString(),
      }),
    sendMessage: (_to: string, _body: string): Promise<never> =>
      Promise.reject(
        new Error(
          'WhatsApp está desligado por decisão. Nenhuma mensagem pode ser enviada pelo Control Plane.',
        ),
      ),
  };
}

export interface AdapterSet {
  readonly github: GitHubAdapter;
  readonly vps: VpsAdapter;
  readonly n8n: N8nAdapter;
  readonly cloudflare: CloudflareAdapter;
  readonly google: GoogleAdapter;
  readonly meta: MetaAdapter;
  readonly whatsapp: WhatsAppAdapter;
}

export function createMockAdapterSet(): AdapterSet {
  return {
    github: createMockGitHubAdapter(),
    vps: createMockVpsAdapter(),
    n8n: createMockN8nAdapter(),
    cloudflare: createMockCloudflareAdapter(),
    google: createMockGoogleAdapter(),
    meta: createMockMetaAdapter(),
    whatsapp: createMockWhatsAppAdapter(),
  };
}
