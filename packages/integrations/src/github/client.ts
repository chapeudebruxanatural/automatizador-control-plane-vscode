/**
 * Cliente GitHub somente leitura sobre o `gh` CLI já autenticado no keychain.
 *
 * Não recebe token, não usa shell e não oferece nenhum comando de escrita. O
 * owner é fixado na construção; uma consulta a outra conta falha antes de
 * alcançar o processo externo.
 */

import { execFile } from 'node:child_process';
import { z } from 'zod';

import type { RepositorySummary } from '../ports/adapters.js';

export type GhReadRunner = (args: readonly string[]) => Promise<string>;

export class GitHubReadError extends Error {
  constructor(readonly operation: string) {
    super(`GitHub não concluiu a operação somente leitura: ${operation}`);
    this.name = 'GitHubReadError';
  }
}

function runGh(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      [...args],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(new GitHubReadError('executar gh CLI'));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

const segmentPattern = /^[A-Za-z0-9_.-]+$/;

const repositorySchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  isPrivate: z.boolean(),
  defaultBranchRef: z.object({ name: z.string().min(1) }).nullable(),
  primaryLanguage: z.object({ name: z.string().min(1) }).nullable(),
  updatedAt: z.string().min(1),
});

const repositoriesSchema = z.array(repositorySchema);

export interface GitHubReadClientOptions {
  readonly owner: string;
  readonly runner?: GhReadRunner;
}

export class GitHubReadClient {
  readonly owner: string;
  private readonly runner: GhReadRunner;

  constructor(options: GitHubReadClientOptions) {
    const owner = options.owner.trim();
    if (!segmentPattern.test(owner)) throw new Error('owner do GitHub inválido');
    this.owner = owner;
    this.runner = options.runner ?? runGh;
  }

  private assertOwner(owner: string): void {
    if (owner !== this.owner) {
      throw new Error(`owner fora do escopo autorizado: ${owner}`);
    }
  }

  private async execute(args: readonly string[], operation: string): Promise<string> {
    try {
      return await this.runner(args);
    } catch {
      throw new GitHubReadError(operation);
    }
  }

  async listRepositories(owner: string): Promise<readonly RepositorySummary[]> {
    this.assertOwner(owner);
    const raw = await this.execute(
      [
        'repo',
        'list',
        owner,
        '--limit',
        '200',
        '--json',
        'name,url,isPrivate,defaultBranchRef,primaryLanguage,updatedAt',
      ],
      'listar repositórios',
    );

    let parsed: z.infer<typeof repositoriesSchema>;
    try {
      parsed = repositoriesSchema.parse(JSON.parse(raw) as unknown);
    } catch {
      throw new GitHubReadError('interpretar lista de repositórios');
    }

    return parsed.map((repository) => ({
      name: repository.name,
      url: repository.url,
      visibility: repository.isPrivate ? 'private' : 'public',
      defaultBranch: repository.defaultBranchRef?.name ?? '',
      primaryLanguage: repository.primaryLanguage?.name ?? null,
      updatedAt: repository.updatedAt,
      likelyClient: null,
      verificationStatus: 'verified',
    }));
  }

  async getRepository(owner: string, repo: string): Promise<RepositorySummary | null> {
    this.assertOwner(owner);
    if (!segmentPattern.test(repo)) throw new Error('nome de repositório inválido');
    const repositories = await this.listRepositories(owner);
    return repositories.find((repository) => repository.name === repo) ?? null;
  }
}
