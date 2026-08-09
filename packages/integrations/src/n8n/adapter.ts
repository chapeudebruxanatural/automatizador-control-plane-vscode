/** Adaptador real do n8n, deliberadamente sem qualquer método mutante. */

import type {
  AdapterHealth,
  N8nAdapter,
  WorkflowSummary,
} from '../ports/adapters.js';
import type { N8nReadClient } from './client.js';

function toSummary(workflow: Awaited<ReturnType<N8nReadClient['getWorkflow']>>): WorkflowSummary | null {
  if (workflow === null) return null;
  return {
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    isArchived: workflow.isArchived,
    updatedAt: workflow.updatedAt ?? '',
    // Nome e tags não bastam para associar um recurso a cliente real.
    clientSlug: null,
  };
}

export function createN8nReadAdapter(client: N8nReadClient): N8nAdapter {
  return {
    name: 'n8n',
    enabled: true,

    async health(): Promise<AdapterHealth> {
      try {
        await client.listWorkflows();
        return {
          reachable: true,
          detail: 'n8n respondeu à leitura de workflows.',
          checkedAt: new Date().toISOString(),
        };
      } catch {
        return {
          reachable: false,
          detail: 'n8n não respondeu à leitura. Nenhuma escrita foi tentada.',
          checkedAt: new Date().toISOString(),
        };
      }
    },

    async listWorkflows(): Promise<readonly WorkflowSummary[]> {
      return (await client.listWorkflows()).map((workflow) => toSummary(workflow) as WorkflowSummary);
    },

    async getWorkflow(id: string): Promise<WorkflowSummary | null> {
      return toSummary(await client.getWorkflow(id));
    },

    listCredentialNames: () => client.listCredentialNames(),
  };
}
