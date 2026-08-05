/**
 * Catálogo de ações conhecidas.
 *
 * As ações mutantes estão registradas de propósito, mesmo sem implementação
 * real. Uma ação declarada e recusada pelo kill switch é observável: aparece na
 * auditoria, é testável, e comunica intenção de desenho. Uma ação ausente
 * apenas produz `unknown_action`, que não distingue "não existe" de "ainda não
 * foi implementada".
 */

import { z } from 'zod';
import { ActionRegistry } from './action.js';
import type { AdapterSet } from '../../integrations/src/adapters/mock.js';

export function createDefaultRegistry(adapters: AdapterSet): ActionRegistry {
  const registry = new ActionRegistry();

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  registry.register({
    kind: 'system.health.check',
    domain: 'system',
    description: 'Verifica a saúde de todos os adaptadores de integração.',
    mutating: false,
    schema: z.object({}).strict(),
    handler: async () => {
      const entries = await Promise.all(
        Object.values(adapters).map(async (adapter) => [
          adapter.name,
          { enabled: adapter.enabled, ...(await adapter.health()) },
        ]),
      );
      return Object.fromEntries(entries) as Record<string, unknown>;
    },
  });

  registry.register({
    kind: 'github.repositories.list',
    domain: 'github',
    description: 'Lista os repositórios de um owner.',
    mutating: false,
    schema: z.object({ owner: z.string().min(1) }).strict(),
    handler: (payload) => adapters.github.listRepositories(payload.owner),
  });

  registry.register({
    kind: 'vps.containers.list',
    domain: 'vps',
    description: 'Lista os containers da VPS.',
    mutating: false,
    schema: z.object({}).strict(),
    handler: () => adapters.vps.listContainers(),
  });

  registry.register({
    kind: 'n8n.workflows.list',
    domain: 'n8n',
    description: 'Lista os workflows do n8n.',
    mutating: false,
    schema: z.object({}).strict(),
    handler: () => adapters.n8n.listWorkflows(),
  });

  registry.register({
    kind: 'meta.adaccounts.list',
    domain: 'meta',
    description: 'Lista as contas de anúncio acessíveis.',
    mutating: false,
    schema: z.object({}).strict(),
    handler: () => adapters.meta.listAdAccounts(),
  });

  // -------------------------------------------------------------------------
  // Mutantes — registradas, nunca alcançáveis com o kill switch acionado
  // -------------------------------------------------------------------------

  registry.register({
    kind: 'vps.container.restart',
    domain: 'vps',
    description: 'Reinicia um container na VPS. Exige aprovação de Nível 2.',
    mutating: true,
    schema: z.object({ container: z.string().min(1), reason: z.string().min(10) }).strict(),
    handler: () =>
      Promise.reject(
        new Error('Escrita na VPS não está implementada. A VPS é somente leitura nesta fase.'),
      ),
  });

  registry.register({
    kind: 'meta.campaign.pause',
    domain: 'meta',
    description: 'Pausa uma campanha. Afeta verba real. Exige aprovação de Nível 2.',
    mutating: true,
    schema: z.object({ campaignId: z.string().min(1), reason: z.string().min(10) }).strict(),
    handler: (payload) => adapters.meta.pauseCampaign(payload.campaignId),
  });

  registry.register({
    kind: 'whatsapp.message.send',
    domain: 'whatsapp',
    description: 'Envia mensagem por WhatsApp. DESLIGADO por decisão desta fase.',
    mutating: true,
    schema: z.object({ to: z.string().min(1), body: z.string().min(1) }).strict(),
    handler: (payload) => adapters.whatsapp.sendMessage(payload.to, payload.body),
  });

  return registry;
}
