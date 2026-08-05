/**
 * Trilha de auditoria.
 *
 * Registra tentativa e desfecho de toda ação — inclusive as recusadas. Uma
 * recusa silenciosa esconde a informação mais valiosa que o sistema produz:
 * que alguma automação está tentando escrever antes da hora.
 *
 * O evento passa por redação antes de ser persistido. Auditoria que vaza
 * credencial resolve um problema criando outro maior.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { redact } from '../../shared/src/redact.js';

export type AuditOutcome = 'executed' | 'refused' | 'failed';

export interface AuditEvent {
  readonly id: string;
  readonly at: string;
  readonly kind: string;
  readonly target: string;
  readonly mutating: boolean;
  readonly outcome: AuditOutcome;
  readonly detail: string;
  readonly clientSlug?: string;
  readonly requestedBy?: string;
  readonly durationMs?: number;
}

export type AuditEventInput = Omit<AuditEvent, 'id' | 'at'>;

export interface AuditProvider {
  readonly name: string;
  record(event: AuditEventInput): Promise<AuditEvent>;
  /** Eventos mais recentes primeiro. Pode ser vazio em sinks sem leitura. */
  list(limit?: number): Promise<readonly AuditEvent[]>;
}

function buildEvent(input: AuditEventInput): AuditEvent {
  return {
    ...(redact(input) as AuditEventInput),
    id: randomUUID(),
    at: new Date().toISOString(),
  };
}

/**
 * Sink em memória, com limite fixo.
 *
 * Perde histórico ao reiniciar — aceitável nesta fase, em que nenhuma ação
 * externa é executada, e explicitamente inadequado para produção.
 */
export function createMemoryAuditProvider(capacity = 1000): AuditProvider {
  const events: AuditEvent[] = [];

  return {
    name: 'memory',
    record: (input) => {
      const event = buildEvent(input);
      events.push(event);
      if (events.length > capacity) events.shift();
      return Promise.resolve(event);
    },
    list: (limit = 100) => Promise.resolve([...events].reverse().slice(0, limit)),
  };
}

/**
 * Sink em arquivo JSON Lines.
 *
 * O caminho padrão (`./audit/`) está no `.gitignore`: a trilha de auditoria
 * nunca deve ser versionada.
 *
 * `list()` devolve vazio de propósito — este sink é append-only. Ler exige
 * decidir sobre rotação e tamanho, o que ainda não foi decidido; devolver algo
 * parcial seria pior que devolver nada declaradamente.
 */
export function createFileAuditProvider(filePath: string): AuditProvider {
  let directoryReady = false;

  return {
    name: 'file',
    record: async (input) => {
      const event = buildEvent(input);
      if (!directoryReady) {
        await mkdir(dirname(filePath), { recursive: true });
        directoryReady = true;
      }
      await appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
      return event;
    },
    list: () => Promise.resolve([]),
  };
}

/** Grava nos dois sinks. Falha em um não impede o outro. */
export function createCompositeAuditProvider(
  providers: readonly AuditProvider[],
): AuditProvider {
  return {
    name: `composite(${providers.map((p) => p.name).join(',')})`,
    record: async (input) => {
      const results = await Promise.allSettled(providers.map((p) => p.record(input)));
      const first = results.find((r) => r.status === 'fulfilled');
      if (first?.status === 'fulfilled') return first.value;
      throw new Error('Nenhum sink de auditoria conseguiu registrar o evento.');
    },
    list: async (limit) => {
      for (const provider of providers) {
        const events = await provider.list(limit);
        if (events.length > 0) return events;
      }
      return [];
    },
  };
}
