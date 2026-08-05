/**
 * Handler dos comandos de consulta do WhatsApp.
 *
 * Superfície FECHADA: apenas os comandos em `ALLOWED_QUERY_COMMANDS` têm
 * handler. Qualquer outra coisa — inclusive os `PROHIBITED_WRITE_COMMANDS`
 * já nomeados no desenho — cai no `default` e devolve recusa. Não existe
 * caminho de execução de shell livre nem de comando não tipado: cada entrada
 * deste `switch` é uma função fixa, não uma string interpolada em lugar
 * nenhum.
 *
 * Toda resposta é curta, de propósito — WhatsApp não é terminal.
 */

import type { ActionExecutor } from '../../../domain/src/executor.js';
import { isExecuted } from '../../../domain/src/result.js';
import type { ClientDirectoryProvider } from './client-directory.js';
import {
  isAllowedQueryCommand,
  type CommandRequest,
  type CommandResponse,
  ALLOWED_QUERY_COMMANDS,
} from './types.js';

export interface CommandHandlerDependencies {
  readonly executor: ActionExecutor;
  readonly clients: ClientDirectoryProvider;
  readonly githubOwner: string;
}

const MAX_LIST_ITEMS = 10;

export function createCommandHandler(deps: CommandHandlerDependencies) {
  const { executor, clients, githubOwner } = deps;

  return async function handleCommand(request: CommandRequest): Promise<CommandResponse> {
    const { command, correlationId } = request;

    if (!isAllowedQueryCommand(command)) {
      return {
        ok: false,
        correlationId,
        text: `Comando não reconhecido. Envie "ajuda" para ver a lista de comandos disponíveis.`,
      };
    }

    switch (command) {
      case 'ajuda':
        return ok(
          correlationId,
          `Comandos disponíveis:\n${ALLOWED_QUERY_COMMANDS.filter((c) => c !== 'ajuda')
            .map((c) => `• ${c}`)
            .join('\n')}\n\nEste canal está em homologação. Nenhuma ação de escrita é aceita.`,
        );

      case 'status': {
        const result = await executor.execute({
          kind: 'system.health.check',
          target: 'control-plane',
          payload: {},
        });
        return ok(
          correlationId,
          isExecuted(result)
            ? `Control Plane operacional. Kill switch ativo. Homologação WhatsApp.`
            : `Não foi possível obter status agora (${result.status}).`,
        );
      }

      case 'status_vps': {
        const result = await executor.execute({
          kind: 'vps.containers.list',
          target: 'nvvps',
          payload: {},
        });
        if (!isExecuted(result)) return ok(correlationId, `VPS: consulta indisponível (${result.status}).`);
        const containers = result.data as readonly unknown[];
        return ok(correlationId, `VPS: ${containers.length} container(s) reportado(s).`);
      }

      case 'status_n8n': {
        const result = await executor.execute({
          kind: 'n8n.workflows.list',
          target: 'n8n',
          payload: {},
        });
        if (!isExecuted(result)) {
          return ok(correlationId, `n8n: sem acesso configurado nesta fase.`);
        }
        const workflows = result.data as readonly unknown[];
        return ok(correlationId, `n8n: ${workflows.length} workflow(s) reportado(s).`);
      }

      case 'status_cloudflare':
        return ok(
          correlationId,
          `Cloudflare: sem credencial configurada nesta fase. Ver docs/runbooks/desbloquear-integracoes.md.`,
        );

      case 'listar_repositorios': {
        const result = await executor.execute({
          kind: 'github.repositories.list',
          target: githubOwner,
          payload: { owner: githubOwner },
        });
        if (!isExecuted(result)) return ok(correlationId, `Repositórios: consulta indisponível.`);
        const repos = result.data as readonly { name: string }[];
        return ok(correlationId, formatList('Repositórios', repos.map((r) => r.name)));
      }

      case 'listar_clientes': {
        const list = await clients.listClients();
        return ok(correlationId, formatList('Clientes', list.map((c) => `${c.name} (${c.status})`)));
      }

      case 'listar_projetos': {
        const list = await clients.listProjects();
        return ok(correlationId, formatList('Projetos', list.map((p) => `${p.name} — ${p.clientSlug}`)));
      }

      case 'listar_riscos': {
        const list = await clients.listOpenRisks();
        return ok(
          correlationId,
          formatList('Riscos abertos', list.map((r) => `[${r.severity}] ${r.title}`)),
        );
      }

      case 'listar_pendencias': {
        const list = await clients.listPendingItems();
        return ok(correlationId, formatList('Pendências', list));
      }
    }
  };
}

function ok(correlationId: string, text: string): CommandResponse {
  return { ok: true, correlationId, text };
}

function formatList(title: string, items: readonly string[]): string {
  if (items.length === 0) return `${title}: nenhum registro disponível.`;
  const shown = items.slice(0, MAX_LIST_ITEMS);
  const suffix = items.length > MAX_LIST_ITEMS ? `\n… e mais ${items.length - MAX_LIST_ITEMS}.` : '';
  return `${title} (${items.length}):\n${shown.map((i) => `• ${i}`).join('\n')}${suffix}`;
}
