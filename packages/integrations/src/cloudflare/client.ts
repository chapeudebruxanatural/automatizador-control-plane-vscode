/**
 * Cliente somente leitura da Cloudflare.
 *
 * O token pode vir do ambiente (CI) ou de um arquivo protegido (uso local).
 * Nenhum método de escrita existe neste módulo: mesmo uma configuração errada
 * não encontra `POST`, `PUT`, `PATCH` ou `DELETE` para chamar.
 */

import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const DEFAULT_CLOUDFLARE_TOKEN_PATH = resolve(
  homedir(),
  'Documents/Codex/.secrets/cloudflare/api-token',
);

export interface CloudflareCredentialOptions {
  readonly env?: Record<string, string | undefined>;
  readonly defaultTokenPath?: string;
}

export interface CloudflareCredentialStatus {
  readonly configured: boolean;
  readonly source: 'environment' | 'protected_file' | 'unavailable';
  readonly reference: string | null;
  readonly fileMode?: string;
  readonly warning?: string;
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== '';
}

async function resolveTokenPath(
  env: Record<string, string | undefined>,
  defaultTokenPath: string,
): Promise<string | null> {
  const explicit = env['CLOUDFLARE_API_TOKEN_PATH'];
  const candidate = present(explicit) ? explicit.trim() : defaultTokenPath;
  try {
    await access(candidate, constants.R_OK);
    return candidate;
  } catch {
    return null;
  }
}

export async function loadCloudflareApiToken(
  options: CloudflareCredentialOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const inline = env['CLOUDFLARE_API_TOKEN'];
  if (present(inline)) return inline.trim();

  const path = await resolveTokenPath(
    env,
    options.defaultTokenPath ?? DEFAULT_CLOUDFLARE_TOKEN_PATH,
  );
  if (path === null) {
    throw new Error('token da Cloudflare não configurado por ambiente nem arquivo protegido');
  }

  const token = (await readFile(path, 'utf8')).trim();
  if (token === '') throw new Error(`token da Cloudflare vazio no caminho protegido: ${path}`);
  return token;
}

export async function describeCloudflareCredential(
  options: CloudflareCredentialOptions = {},
): Promise<CloudflareCredentialStatus> {
  const env = options.env ?? process.env;
  if (present(env['CLOUDFLARE_API_TOKEN'])) {
    return { configured: true, source: 'environment', reference: 'CLOUDFLARE_API_TOKEN' };
  }

  const path = await resolveTokenPath(
    env,
    options.defaultTokenPath ?? DEFAULT_CLOUDFLARE_TOKEN_PATH,
  );
  if (path === null) return { configured: false, source: 'unavailable', reference: null };

  const info = await stat(path);
  const mode = (info.mode & 0o777).toString(8).padStart(3, '0');
  return {
    configured: true,
    source: 'protected_file',
    reference: path,
    fileMode: mode,
    ...(Number.parseInt(mode, 8) & 0o077
      ? { warning: `token com permissão ${mode}; esperado 600` }
      : {}),
  };
}

export interface CloudflareReadClientOptions {
  readonly accountId: string;
  readonly token: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

interface CloudflareEnvelope<T> {
  readonly success?: boolean;
  readonly result?: T;
  readonly errors?: readonly { readonly code?: number; readonly message?: string }[];
}

export class CloudflareReadError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
  ) {
    super(`Cloudflare recusou ${operation} com HTTP ${status}`);
    this.name = 'CloudflareReadError';
  }
}

export class CloudflareReadClient {
  private readonly accountId: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CloudflareReadClientOptions) {
    if (options.accountId.trim() === '') throw new Error('accountId da Cloudflare é obrigatório');
    if (options.token.trim() === '') throw new Error('token da Cloudflare é obrigatório');
    this.accountId = options.accountId.trim();
    this.token = options.token.trim();
    this.baseUrl = options.baseUrl ?? 'https://api.cloudflare.com/client/v4';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async get<T>(path: string, operation: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const body = (await response.json()) as CloudflareEnvelope<T>;
    if (!response.ok || body.success !== true || body.result === undefined) {
      throw new CloudflareReadError(operation, response.status);
    }
    return body.result;
  }

  listZones(): Promise<readonly unknown[]> {
    const query = new URLSearchParams({ 'account.id': this.accountId, per_page: '50' });
    return this.get(`/zones?${query.toString()}`, 'listar zonas');
  }

  listDnsRecords(zoneId: string): Promise<readonly unknown[]> {
    return this.get(`/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100`, 'listar DNS');
  }

  listPagesProjects(): Promise<readonly unknown[]> {
    return this.get(`/accounts/${this.accountId}/pages/projects`, 'listar Pages');
  }

  listWorkerScripts(): Promise<readonly unknown[]> {
    return this.get(`/accounts/${this.accountId}/workers/scripts`, 'listar Workers');
  }

  listWorkerDomains(): Promise<readonly unknown[]> {
    return this.get(`/accounts/${this.accountId}/workers/domains`, 'listar domínios de Workers');
  }

  listTunnels(): Promise<readonly unknown[]> {
    return this.get(
      `/accounts/${this.accountId}/cfd_tunnel?is_deleted=false&per_page=100`,
      'listar túneis',
    );
  }
}
