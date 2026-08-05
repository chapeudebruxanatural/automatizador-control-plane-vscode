/**
 * Ações: a única forma de o Control Plane tocar em qualquer coisa.
 *
 * Toda operação passa por aqui, inclusive as de leitura. Uniformidade tem um
 * preço em cerimônia e paga em garantia: não existe caminho lateral que escape
 * da validação, do freio e da auditoria.
 */

import type { ZodType } from 'zod';

/** Sistemas que o Control Plane alcança. */
export const ACTION_DOMAINS = [
  'github',
  'vps',
  'n8n',
  'cloudflare',
  'google',
  'meta',
  'whatsapp',
  'inventory',
  'system',
] as const;

export type ActionDomain = (typeof ACTION_DOMAINS)[number];

/**
 * Requisição de ação. `mutating` não vem daqui — vem da definição registrada,
 * para que quem chama não possa declarar uma escrita como leitura.
 */
export interface ActionRequest<P = unknown> {
  readonly kind: string;
  readonly target: string;
  readonly payload: P;
  readonly clientSlug?: string;
  readonly requestedBy?: string;
}

export interface ActionContext {
  readonly clientSlug?: string;
  readonly requestedBy?: string;
  readonly dryRun: boolean;
}

/**
 * Definição de uma ação. O registro é a fonte da verdade sobre o que a ação
 * pode fazer — em particular, se ela muda estado externo.
 */
export interface ActionDefinition<P = unknown, R = unknown> {
  readonly kind: string;
  readonly domain: ActionDomain;
  readonly description: string;
  /** Produz efeito colateral externo? Se sim, passa pelo kill switch. */
  readonly mutating: boolean;
  readonly schema: ZodType<P>;
  readonly handler: (payload: P, ctx: ActionContext) => Promise<R>;
}

/**
 * Registro de ações conhecidas.
 *
 * Ação não registrada é recusada. Não existe execução anônima: se não há
 * esquema e classificação declarados, não há como decidir com segurança.
 */
export class ActionRegistry {
  readonly #definitions = new Map<string, ActionDefinition>();

  register<P, R>(definition: ActionDefinition<P, R>): this {
    if (this.#definitions.has(definition.kind)) {
      throw new Error(`Ação já registrada: ${definition.kind}`);
    }
    this.#definitions.set(definition.kind, definition as unknown as ActionDefinition);
    return this;
  }

  get(kind: string): ActionDefinition | undefined {
    return this.#definitions.get(kind);
  }

  has(kind: string): boolean {
    return this.#definitions.has(kind);
  }

  list(): readonly ActionDefinition[] {
    return [...this.#definitions.values()];
  }

  listMutating(): readonly ActionDefinition[] {
    return this.list().filter((d) => d.mutating);
  }
}
