/** Cliente da Graph API da Meta limitado a operações GET. */

export const META_GRAPH_API_VERSION = 'v26.0';

export interface MetaCredentialOptions {
  readonly env?: Record<string, string | undefined>;
}

export interface MetaCredentialStatus {
  readonly configured: boolean;
  readonly source: 'environment' | 'unavailable';
  readonly reference: string | null;
}

export function loadMetaAccessToken(options: MetaCredentialOptions = {}): string {
  const token = (options.env ?? process.env)['META_ACCESS_TOKEN']?.trim() ?? '';
  if (token === '') throw new Error('token da Meta não configurado no ambiente');
  return token;
}

export function describeMetaCredential(
  options: MetaCredentialOptions = {},
): MetaCredentialStatus {
  const configured = ((options.env ?? process.env)['META_ACCESS_TOKEN']?.trim() ?? '') !== '';
  return {
    configured,
    source: configured ? 'environment' : 'unavailable',
    reference: configured ? 'META_ACCESS_TOKEN' : null,
  };
}

export interface MetaReadClientOptions {
  readonly token: string;
  readonly apiVersion?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly maxPages?: number;
}

interface MetaPage<T> {
  readonly data?: readonly T[];
  readonly paging?: {
    readonly cursors?: { readonly after?: string };
    readonly next?: string;
  };
  readonly error?: { readonly code?: number };
}

export class MetaReadError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    readonly apiCode: number | null,
  ) {
    super(
      `Meta recusou ${operation} com HTTP ${status}` +
        (apiCode === null ? '' : ` e código ${apiCode}`),
    );
    this.name = 'MetaReadError';
  }
}

export class MetaReadClient {
  private readonly token: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxPages: number;

  constructor(options: MetaReadClientOptions) {
    if (options.token.trim() === '') throw new Error('token da Meta é obrigatório');
    this.token = options.token.trim();
    this.apiVersion = (options.apiVersion ?? META_GRAPH_API_VERSION).replace(/^\/+|\/+$/g, '');
    if (!/^v\d+\.\d+$/.test(this.apiVersion)) throw new Error('versão da Graph API inválida');
    this.baseUrl = (options.baseUrl ?? 'https://graph.facebook.com').replace(/\/+$/g, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxPages = options.maxPages ?? 20;
    if (!Number.isInteger(this.maxPages) || this.maxPages < 1) {
      throw new Error('maxPages deve ser inteiro positivo');
    }
  }

  private async list<T>(
    path: string,
    fields: string,
    operation: string,
  ): Promise<readonly T[]> {
    const items: T[] = [];
    let after: string | null = null;

    for (let pageNumber = 0; pageNumber < this.maxPages; pageNumber += 1) {
      const query = new URLSearchParams({ fields, limit: '100' });
      if (after !== null) query.set('after', after);
      const url = `${this.baseUrl}/${this.apiVersion}/${path}?${query.toString()}`;
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.token}` },
      });

      let body: MetaPage<T> = {};
      try {
        body = (await response.json()) as MetaPage<T>;
      } catch {
        throw new MetaReadError(operation, response.status, null);
      }

      if (!response.ok || body.error !== undefined || body.data === undefined) {
        throw new MetaReadError(operation, response.status, body.error?.code ?? null);
      }

      items.push(...body.data);
      const nextAfter = body.paging?.cursors?.after;
      if (body.paging?.next === undefined || nextAfter === undefined || nextAfter === '') {
        return items;
      }
      after = nextAfter;
    }

    throw new Error(`Meta excedeu o limite seguro de ${this.maxPages} páginas em ${operation}`);
  }

  listAdAccounts(): Promise<readonly unknown[]> {
    return this.list('me/adaccounts', 'id,name,account_status,currency', 'listar contas de anúncios');
  }

  listCampaigns(adAccountId: string): Promise<readonly unknown[]> {
    const normalized = adAccountId.trim();
    if (!/^act_\d+$/.test(normalized)) {
      throw new Error('adAccountId da Meta deve usar o formato act_<números>');
    }
    return this.list(
      `${encodeURIComponent(normalized)}/campaigns`,
      'id,name,status,daily_budget',
      'listar campanhas',
    );
  }
}
