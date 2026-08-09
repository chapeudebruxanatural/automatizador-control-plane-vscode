import { z } from 'zod';

import type { ProvisionedPagesProject, ProvisionedRepository } from './types.js';

const segmentPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pagesResponseSchema = z.object({
  success: z.literal(true),
  result: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    subdomain: z.string().min(1),
  }),
});

export interface CloudflareProvisioningClientOptions {
  readonly accountId: string;
  readonly token: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export class CloudflareProvisioningError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
  ) {
    super(`Cloudflare recusou ${operation} com HTTP ${status}`);
    this.name = 'CloudflareProvisioningError';
  }
}

export class CloudflareProvisioningClient {
  private readonly accountId: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CloudflareProvisioningClientOptions) {
    if (options.accountId.trim() === '') throw new Error('accountId da Cloudflare obrigatório');
    if (options.token.trim() === '') throw new Error('token de provisionamento Cloudflare obrigatório');
    this.accountId = options.accountId.trim();
    this.token = options.token.trim();
    this.baseUrl = options.baseUrl ?? 'https://api.cloudflare.com/client/v4';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async post(path: string, operation: string, body: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new CloudflareProvisioningError(operation, response.status);
    return (await response.json()) as unknown;
  }

  async createPagesProject(options: {
    readonly projectName: string;
    readonly repository: ProvisionedRepository;
    readonly githubOwner: string;
    readonly productionBranch: string;
  }): Promise<ProvisionedPagesProject> {
    if (!segmentPattern.test(options.projectName)) throw new Error('nome de projeto Pages inválido');
    const raw = await this.post(
      `/accounts/${encodeURIComponent(this.accountId)}/pages/projects`,
      'criar projeto Pages',
      {
        name: options.projectName,
        production_branch: options.productionBranch,
        source: {
          type: 'github',
          config: {
            owner: options.githubOwner,
            owner_id: options.repository.ownerId,
            repo_name: options.repository.name,
            repo_id: options.repository.id,
            production_branch: options.productionBranch,
            production_deployments_enabled: true,
            preview_deployment_setting: 'all',
            pr_comments_enabled: true,
          },
        },
      },
    );
    return pagesResponseSchema.parse(raw).result;
  }

  async addPagesDomain(projectName: string, domain: string): Promise<void> {
    if (!segmentPattern.test(projectName)) throw new Error('nome de projeto Pages inválido');
    await this.post(
      `/accounts/${encodeURIComponent(this.accountId)}/pages/projects/${encodeURIComponent(projectName)}/domains`,
      'adicionar domínio ao Pages',
      { name: domain },
    );
  }
}
