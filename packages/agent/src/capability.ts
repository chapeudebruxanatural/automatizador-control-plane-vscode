/**
 * Classificação de risco das ações do agente.
 *
 * O `ActionRegistry` do domínio já separa leitura de escrita com `mutating`.
 * Isso basta para o kill switch, mas não para o WhatsApp: "gerar relatório" e
 * "subir orçamento para R$ 500" são ambas alcançáveis por mensagem, e tratar as
 * duas igual erra dos dois lados — ou pede confirmação para tudo, e o dono para
 * de ler o que confirma, ou não pede para nada.
 *
 * Aqui a escala é de consequência, não de tipo técnico.
 */

import type { ActionDefinition } from '../../domain/src/action.js';

/**
 * - `read`      — não muda nada. Executa direto.
 * - `reversible`— muda algo que se desfaz sem custo (pausar campanha, por
 *                 exemplo). Confirmação por código.
 * - `costly`    — gasta dinheiro, publica, ou altera conta de cliente.
 *                 Confirmação por código **e** registro do valor em risco.
 * - `forbidden` — não é alcançável por agente, ponto. Existe declarada para
 *                 que a recusa seja observável em auditoria em vez de virar
 *                 "ação desconhecida".
 */
export type RiskTier = 'read' | 'reversible' | 'costly' | 'forbidden';

export interface AgentCapability {
  readonly actionKind: string;
  readonly tier: RiskTier;
  /** Frase que o agente usa para descrever a ação antes de confirmar. */
  readonly summaryTemplate: string;
  /**
   * Alcançável pelo canal do WhatsApp?
   *
   * Separado do tier de propósito: existe ação de leitura que não deve ir para
   * o celular por vazar dado demais numa tela que fica desbloqueada.
   */
  readonly viaWhatsApp: boolean;
}

/** Precisa de código de confirmação antes de executar? */
export function requiresConfirmation(tier: RiskTier): boolean {
  return tier === 'reversible' || tier === 'costly';
}

/** Pode ser executada por um agente, em qualquer canal? */
export function isReachable(tier: RiskTier): boolean {
  return tier !== 'forbidden';
}

export class CapabilityViolationError extends Error {
  constructor(
    message: string,
    readonly actionKind: string,
    readonly tier: RiskTier,
  ) {
    super(message);
    this.name = 'CapabilityViolationError';
  }
}

/**
 * Catálogo de capacidades do agente.
 *
 * Uma ação sem capacidade declarada **não é alcançável pelo agente**, mesmo
 * que exista no `ActionRegistry`. Falha fechada: registrar a ação no domínio é
 * decisão de engenharia, expor ao agente é decisão de operação, e as duas não
 * devem acontecer pelo mesmo gesto.
 */
export class CapabilityCatalog {
  readonly #byKind = new Map<string, AgentCapability>();

  register(capability: AgentCapability): this {
    if (this.#byKind.has(capability.actionKind)) {
      throw new Error(`Capacidade já declarada: ${capability.actionKind}`);
    }
    this.#byKind.set(capability.actionKind, capability);
    return this;
  }

  get(actionKind: string): AgentCapability | undefined {
    return this.#byKind.get(actionKind);
  }

  list(): readonly AgentCapability[] {
    return [...this.#byKind.values()];
  }

  /** O que o agente pode oferecer num canal. É isto que vai ao modelo. */
  listForChannel(channel: 'whatsapp' | 'any'): readonly AgentCapability[] {
    return this.list().filter(
      (c) => isReachable(c.tier) && (channel === 'any' || c.viaWhatsApp),
    );
  }

  /**
   * Decide se uma ação pode seguir, e como.
   *
   * Recusa antes de qualquer efeito: ação não declarada, proibida, ou fora do
   * canal não chega a virar plano.
   */
  authorize(
    actionKind: string,
    channel: 'whatsapp' | 'any',
  ): { readonly capability: AgentCapability; readonly needsConfirmation: boolean } {
    const capability = this.#byKind.get(actionKind);
    if (capability === undefined) {
      throw new CapabilityViolationError(
        `Ação "${actionKind}" não está declarada como capacidade do agente.`,
        actionKind,
        'forbidden',
      );
    }
    if (!isReachable(capability.tier)) {
      throw new CapabilityViolationError(
        `Ação "${actionKind}" é proibida para agente.`,
        actionKind,
        capability.tier,
      );
    }
    if (channel === 'whatsapp' && !capability.viaWhatsApp) {
      throw new CapabilityViolationError(
        `Ação "${actionKind}" não é alcançável por WhatsApp.`,
        actionKind,
        capability.tier,
      );
    }
    return { capability, needsConfirmation: requiresConfirmation(capability.tier) };
  }

  /**
   * Confere o catálogo contra o registro de ações do domínio.
   *
   * Pega duas divergências que só apareceriam em produção: capacidade que
   * aponta para ação inexistente, e ação mutante exposta como leitura — esta
   * última é a perigosa, porque faria o agente executar escrita sem confirmar.
   */
  validateAgainst(definitions: readonly ActionDefinition[]): readonly string[] {
    const byKind = new Map(definitions.map((d) => [d.kind, d]));
    const problems: string[] = [];

    for (const capability of this.list()) {
      const definition = byKind.get(capability.actionKind);
      if (definition === undefined) {
        problems.push(`capacidade "${capability.actionKind}" não existe no ActionRegistry`);
        continue;
      }
      if (definition.mutating && capability.tier === 'read') {
        problems.push(
          `"${capability.actionKind}" é mutante no domínio mas está declarada como "read" — ` +
            'executaria escrita sem confirmação',
        );
      }
    }
    return problems;
  }
}
