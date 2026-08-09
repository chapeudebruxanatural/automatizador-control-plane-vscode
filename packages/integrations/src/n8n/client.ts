/**
 * Cliente somente leitura da API pública do n8n.
 *
 * A chave ampla existe por limitação do plano atual do n8n. A contenção é
 * local e estrutural: este módulo só implementa GET e projeta cada resposta
 * para metadados antes de devolvê-la. Nós, parâmetros, conexões, dados fixados
 * e valores de credenciais nunca saem do cliente.
 */

import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import {
  parseCredentials,
  parseWorkflow,
  parseWorkflows,
  type N8nCredentialSummary,
  type N8nWorkflowSummary,
} from './parser.js';

export const DEFAULT_N8N_API_KEY_PATH = resolve(
  homedir(),
  'Documents/Codex/.secrets/n8n/api-key',
);

export interface N8nCredentialOptions {
  readonly env?: Record<string, string | undefined>;
  readonly defaultKeyPath?: string;
}

export interface N8nCredentialStatus {
  readonly configured: boolean;
  readonly source: 'environment' | 'protected_file' | 'unavailable';
  readonly reference: string | null;
  readonly fileMode?: string;
  readonly warning?: string;
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== '';
}

async function resolveKeyPath(
  env: Record<string, string | undefined>,
  defaultKeyPath: string,
): Promise<string | null> {
  const explicit = env['N8N_API_KEY_PATH'];
  const candidate = present(explicit) ? explicit.trim() : defaultKeyPath;
  try {
    await access(candidate, constants.R_OK);
    return candidate;
  } catch {
    return null;
  }
}

export async function loadN8nApiKey(options: N8nCredentialOptions = {}): Promise<string> {
  const env = options.env ?? process.env;
  const inline = env['N8N_API_KEY'];
  if (present(inline)) return inline.trim();

  const path = await resolveKeyPath(env, options.defaultKeyPath ?? DEFAULT_N8N_API_KEY_PATH);
  if (path === null) {
    throw new Error('chave da API do n8n não configurada por ambiente nem arquivo protegido');
  }

  const key = (await readFile(path, 'utf8')).trim();
  if (key === '') throw new Error(`chave da API do n8n vazia no caminho protegido: ${path}`);
  return key;
}

export async function describeN8nCredential(
  options: N8nCredentialOptions = {},
): Promise<N8nCredentialStatus> {
  const env = options.env ?? process.env;
  if (present(env['N8N_API_KEY'])) {
    return { configured: true, source: 'environment', reference: 'N8N_API_KEY' };
  }

  const path = await resolveKeyPath(env, options.defaultKeyPath ?? DEFAULT_N8N_API_KEY_PATH);
  if (path === null) return { configured: false, source: 'unavailable', reference: null };

  const info = await stat(path);
  const mode = (info.mode & 0o777).toString(8).padStart(3, '0');
  return {
    configured: true,
    source: 'protected_file',
    reference: path,
    fileMode: mode,
    ...(Number.parseInt(mode, 8) & 0o077
      ? { warning: `chave com permissão ${mode}; esperado 600` }
      : {}),
  };
}

export interface N8nReadClientOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
}

interface N8nListEnvelope {
  readonly data?: unknown;
  readonly nextCursor?: unknown;
}

export class N8nReadError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
  ) {
    super(`n8n recusou ${operation} com HTTP ${status}`);
    this.name = 'N8nReadError';
  }
}

function normalizeBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error('N8N_BASE_URL inválida');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('N8N_BASE_URL deve usar HTTP ou HTTPS');
  }
  return parsed.toString().replace(/\/$/, '');
}

function cursorFrom(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

export class N8nReadClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: N8nReadClientOptions) {
    if (options.apiKey.trim() === '') throw new Error('chave da API do n8n é obrigatória');
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async get(path: string, operation: string): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: { 'X-N8N-API-KEY': this.apiKey, Accept: 'application/json' },
    });
    if (!response.ok) throw new N8nReadError(operation, response.status);
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new N8nReadError(operation, response.status);
    }
  }

  async listWorkflows(): Promise<readonly N8nWorkflowSummary[]> {
    const workflows: N8nWorkflowSummary[] = [];
    let cursor: string | null = null;

    do {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor !== null) query.set('cursor', cursor);
      const raw = await this.get(`/api/v1/workflows?${query.toString()}`, 'listar workflows');
      workflows.push(...parseWorkflows(raw));
      const envelope = (raw ?? {}) as N8nListEnvelope;
      cursor = cursorFrom(envelope.nextCursor);
    } while (cursor !== null);

    return workflows;
  }

  async getWorkflow(id: string): Promise<N8nWorkflowSummary | null> {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('id de workflow do n8n inválido');
    try {
      const raw = await this.get(`/api/v1/workflows/${encodeURIComponent(id)}`, 'ler workflow');
      return parseWorkflow(raw);
    } catch (error) {
      if (error instanceof N8nReadError && error.status === 404) return null;
      throw error;
    }
  }

  /**
   * A instalação atual responde 405 a GET /credentials. Mantemos o método
   * somente leitura e falhamos de forma explícita, sem fingir uma lista vazia.
   */
  async listCredentialNames(): Promise<readonly N8nCredentialSummary[]> {
    const raw = await this.get('/api/v1/credentials?limit=100', 'listar nomes de credenciais');
    return parseCredentials(raw);
  }
}
