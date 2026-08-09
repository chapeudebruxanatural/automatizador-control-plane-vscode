#!/usr/bin/env node
/**
 * Coleta reproduzível do n8n, estritamente por GET.
 *
 * A saída contém apenas metadados. O script não escreve no repositório e não
 * imprime nós, parâmetros, conexões, webhooks, credenciais nem a chave da API.
 */

import {
  N8nReadClient,
  loadN8nApiKey,
} from '../packages/integrations/src/n8n/client.js';

const baseUrl = process.env['N8N_BASE_URL']?.trim() ?? '';
if (baseUrl === '') throw new Error('N8N_BASE_URL ausente');

const client = new N8nReadClient({ baseUrl, apiKey: await loadN8nApiKey() });
const workflows = await client.listWorkflows();

const safe = workflows.map((workflow) => ({
  id: workflow.id,
  name: workflow.name,
  active: workflow.active,
  isArchived: workflow.isArchived,
  updatedAt: workflow.updatedAt,
  clientSlug: null,
  clientVerificationStatus: 'unknown',
}));

process.stdout.write(`${JSON.stringify({
  meta: {
    collectedAt: new Date().toISOString(),
    source: 'n8n Public API (somente leitura)',
    changesMade: 0,
  },
  stats: {
    total: safe.length,
    active: safe.filter((workflow) => workflow.active).length,
    inactive: safe.filter((workflow) => !workflow.active).length,
    archived: safe.filter((workflow) => workflow.isArchived).length,
  },
  workflows: safe,
}, null, 2)}\n`);
