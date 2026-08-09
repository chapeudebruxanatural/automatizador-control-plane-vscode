/** Adaptador real de leitura da VPS, sem superfície de escrita. */

import type {
  AdapterHealth,
  ContainerSummary,
  HostSummary,
  VpsAdapter,
} from '../ports/adapters.js';
import type { VpsReadClient } from './client.js';

export function createVpsReadAdapter(client: VpsReadClient): VpsAdapter {
  return {
    name: 'vps',
    enabled: true,

    async health(): Promise<AdapterHealth> {
      try {
        await client.getHost();
        return {
          reachable: true,
          detail: 'VPS respondeu à leitura de saúde pela lista branca SSH.',
          checkedAt: new Date().toISOString(),
        };
      } catch {
        return {
          reachable: false,
          detail: 'VPS não respondeu à leitura. Nenhuma escrita foi tentada.',
          checkedAt: new Date().toISOString(),
        };
      }
    },

    getHost(): Promise<HostSummary> {
      return client.getHost();
    },

    listContainers(): Promise<readonly ContainerSummary[]> {
      return client.listContainers();
    },

    listStacks(): Promise<readonly string[]> {
      return client.listStacks();
    },
  };
}
