import { Buffer } from 'node:buffer';
import { z } from 'zod';

import type { ProvisionedRepository, StarterFile } from './types.js';

const segmentPattern = /^[A-Za-z0-9_.-]+$/;
const filePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./-]+$/;

const repositoryResponseSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  html_url: z.string().url(),
  private: z.literal(true),
  default_branch: z.string().min(1),
  owner: z.object({ id: z.union([z.string(), z.number()]) }),
});

export interface GitHubProvisioningClientOptions {
  readonly owner: string;
  readonly token: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export class GitHubProvisioningError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
  ) {
    super(`GitHub recusou ${operation} com HTTP ${status}`);
    this.name = 'GitHubProvisioningError';
  }
}

export class GitHubProvisioningClient {
  readonly owner: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubProvisioningClientOptions) {
    if (!segmentPattern.test(options.owner)) throw new Error('owner do GitHub inválido');
    if (options.token.trim() === '') throw new Error('token de provisionamento GitHub obrigatório');
    this.owner = options.owner;
    this.token = options.token.trim();
    this.baseUrl = options.baseUrl ?? 'https://api.github.com';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(path: string, operation: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new GitHubProvisioningError(operation, response.status);
    return response.status === 204 ? null : (await response.json()) as unknown;
  }

  async createPrivateRepository(options: {
    readonly name: string;
    readonly description: string;
  }): Promise<ProvisionedRepository> {
    if (!segmentPattern.test(options.name)) throw new Error('nome de repositório inválido');
    const raw = await this.request('/user/repos', 'criar repositório privado', {
      method: 'POST',
      body: JSON.stringify({
        name: options.name,
        description: options.description,
        private: true,
        auto_init: true,
      }),
    });
    const repository = repositoryResponseSchema.parse(raw);
    if (repository.name !== options.name) throw new Error('GitHub devolveu repositório diferente');
    return {
      id: String(repository.id),
      ownerId: String(repository.owner.id),
      name: repository.name,
      url: repository.html_url,
      defaultBranch: repository.default_branch,
      visibility: 'private',
    };
  }

  async seedFiles(repository: string, branch: string, files: readonly StarterFile[]): Promise<void> {
    if (!segmentPattern.test(repository) || !segmentPattern.test(branch)) {
      throw new Error('repositório ou branch inválido');
    }
    for (const file of files) {
      if (!filePathPattern.test(file.path)) throw new Error('caminho de arquivo inválido');
      await this.request(
        `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(repository)}/contents/${file.path
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`,
        `criar arquivo ${file.path}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            message: `feat: inicia projeto de ${repository}`,
            content: Buffer.from(file.content, 'utf8').toString('base64'),
            branch,
          }),
        },
      );
    }
  }
}
