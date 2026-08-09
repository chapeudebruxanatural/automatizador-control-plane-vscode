/** Adaptador GitHub real, deliberadamente limitado a metadados de leitura. */

import type { AdapterHealth, GitHubAdapter, RepositorySummary } from '../ports/adapters.js';
import type { GitHubReadClient } from './client.js';

export function createGitHubReadAdapter(client: GitHubReadClient): GitHubAdapter {
  return {
    name: 'github',
    enabled: true,

    async health(): Promise<AdapterHealth> {
      try {
        await client.listRepositories(client.owner);
        return {
          reachable: true,
          detail: 'GitHub respondeu à leitura de repositórios pelo gh CLI.',
          checkedAt: new Date().toISOString(),
        };
      } catch {
        return {
          reachable: false,
          detail: 'GitHub não respondeu à leitura. Nenhuma escrita foi tentada.',
          checkedAt: new Date().toISOString(),
        };
      }
    },

    listRepositories(owner: string): Promise<readonly RepositorySummary[]> {
      return client.listRepositories(owner);
    },

    getRepository(owner: string, repo: string): Promise<RepositorySummary | null> {
      return client.getRepository(owner, repo);
    },
  };
}
