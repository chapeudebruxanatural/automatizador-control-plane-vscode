/**
 * Adaptador da Evolution API.
 *
 * MÓDULO EM HOMOLOGAÇÃO. `enabled: false` — nenhuma chamada de rede real
 * acontece nesta fase. A implementação mock devolve dados plausíveis para
 * exercitar o resto do pipeline (allowlist, rate limit, comandos) sem tocar
 * em WhatsApp real.
 *
 * `sendMessage` tem assinatura que devolve `never`: não existe caminho de
 * retorno de sucesso. Ver `docs/architecture/whatsapp-evolution.md` para o
 * porquê da decisão de manter o canal de escrita fechado nesta fase.
 */

import type { AdapterHealth } from '../ports/adapters.js';
import type { EvolutionHealth, EvolutionInstanceSummary, MaskedPhone } from './types.js';
import { maskPhone } from './types.js';

export interface EvolutionAdapter {
  readonly name: 'evolution';
  readonly enabled: boolean;
  readonly writeActionsEnabled: false;
  health(): Promise<AdapterHealth>;
  getStatus(): Promise<EvolutionHealth>;
  listInstances(): Promise<readonly EvolutionInstanceSummary[]>;
  /** Nunca implementado nesta fase. Sempre rejeita. */
  sendMessage(to: string, body: string): Promise<never>;
}

const WRITE_DISABLED_MESSAGE =
  'Envio de WhatsApp está desligado nesta fase (writeActionsEnabled=false). ' +
  'Ver docs/runbooks/whatsapp-homologation.md.';

export function createMockEvolutionAdapter(): EvolutionAdapter {
  return {
    name: 'evolution',
    enabled: false,
    writeActionsEnabled: false,

    health: () =>
      Promise.resolve({
        reachable: false,
        detail: 'evolution: adaptador simulado, sem conexão real (homologação).',
        checkedAt: new Date().toISOString(),
      }),

    getStatus: () =>
      Promise.resolve({
        reachable: false,
        version: null,
        instanceCount: 0,
        checkedAt: new Date().toISOString(),
      }),

    listInstances: () => Promise.resolve([]),

    sendMessage: (_to: string, _body: string): Promise<never> =>
      Promise.reject(new Error(WRITE_DISABLED_MESSAGE)),
  };
}

/**
 * Adaptador real, construído sobre `fetch`.
 *
 * Ainda `enabled: false` por padrão — fica `true` apenas quando
 * `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` estiverem configurados E o dono
 * aprovar explicitamente a conexão com o número real (ver runbook).
 * `sendMessage` permanece bloqueado independentemente da configuração: a
 * decisão de habilitar escrita é do executor de ações (kill switch +
 * aprovação), nunca deste adaptador sozinho.
 */
export function createHttpEvolutionAdapter(config: {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}): EvolutionAdapter {
  const enabled = Boolean(config.baseUrl && config.apiKey);

  const request = async (path: string): Promise<Response> =>
    fetch(new URL(path, config.baseUrl), {
      headers: { apikey: config.apiKey }, // pragma: allowlist-secret — repassa variavel, nunca literal
    });

  return {
    name: 'evolution',
    enabled,
    writeActionsEnabled: false,

    health: async () => {
      if (!enabled) {
        return {
          reachable: false,
          detail: 'evolution: credenciais não configuradas.',
          checkedAt: new Date().toISOString(),
        };
      }
      try {
        const res = await request('/');
        return {
          reachable: res.ok,
          detail: `evolution: HTTP ${res.status}`,
          checkedAt: new Date().toISOString(),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { reachable: false, detail: `evolution: ${message}`, checkedAt: new Date().toISOString() };
      }
    },

    getStatus: async () => {
      if (!enabled) {
        return { reachable: false, version: null, instanceCount: 0, checkedAt: new Date().toISOString() };
      }
      try {
        const res = await request(`/instance/connectionState/${config.instanceName}`);
        const body = res.ok ? ((await res.json()) as Record<string, unknown>) : {};
        return {
          reachable: res.ok,
          version: typeof body['version'] === 'string' ? body['version'] : null,
          instanceCount: res.ok ? 1 : 0,
          checkedAt: new Date().toISOString(),
        };
      } catch {
        return { reachable: false, version: null, instanceCount: 0, checkedAt: new Date().toISOString() };
      }
    },

    listInstances: async () => {
      if (!enabled) return [];
      try {
        const res = await request('/instance/fetchInstances');
        if (!res.ok) return [];
        const body = (await res.json()) as unknown[];
        return body.map((item) => {
          const i = (item ?? {}) as Record<string, unknown>;
          const rawNumber = typeof i['number'] === 'string' ? i['number'] : null;
          return {
            name: typeof i['instanceName'] === 'string' ? i['instanceName'] : 'unknown',
            maskedNumber: rawNumber ? (maskPhone(rawNumber) as MaskedPhone) : null,
            status: normalizeStatus(i['status']),
            verificationStatus: 'discovered' as const,
          };
        });
      } catch {
        return [];
      }
    },

    // Bloqueado independentemente de `enabled`. Ver docstring da função.
    sendMessage: (_to: string, _body: string): Promise<never> =>
      Promise.reject(new Error(WRITE_DISABLED_MESSAGE)),
  };
}

function normalizeStatus(value: unknown): EvolutionInstanceSummary['status'] {
  const s = typeof value === 'string' ? value.toLowerCase() : '';
  if (s === 'open' || s === 'connecting' || s === 'close') return s;
  return 'unknown';
}
