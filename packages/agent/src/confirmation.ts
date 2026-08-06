/**
 * Confirmação de ação por código curto.
 *
 * É o que torna comando por WhatsApp seguro em vez de imprudente. O dono não
 * digita "sobe pra 500" e a coisa acontece: o agente monta um plano, devolve um
 * código, e só executa quando o código volta.
 *
 *     dono:    sobe o orçamento do Cássio pra 500
 *     agente:  Cássio Ferraz · campanha 24066140634
 *              orçamento R$ 472,94 → R$ 500,00
 *              confirma com: 7F3A21
 *     dono:    7F3A21
 *     agente:  executado.
 *
 * ## Por que o código é derivado do plano, e não sorteado
 *
 * O código é um prefixo do SHA-256 do plano. Isso não é detalhe de
 * implementação: significa que o código **só confere para aquele plano
 * exato**. Se qualquer coisa mudar entre planejar e confirmar — o valor, a
 * campanha, o cliente — o código deixa de bater e a execução é recusada
 * sozinha, sem depender de ninguém reparar.
 *
 * É o mesmo princípio que o `write-adapter` do Google Ads já usa, generalizado
 * para qualquer ação.
 *
 * ## O que este módulo NÃO faz
 *
 * Não executa nada e não conhece adaptador nenhum. Só decide se uma confirmação
 * é válida. Quem executa é o executor, depois de receber `ok: true`.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Caracteres do código. Sem 0/O e 1/I: o dono lê da tela e digita de volta. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

/**
 * Validade da confirmação.
 *
 * Curto de propósito. Um plano é uma foto do estado: quanto mais velho, maior
 * a chance de o mundo ter mudado embaixo dele. Cinco minutos é folgado para
 * quem está conversando e apertado para quem esqueceu a mensagem aberta.
 */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface PendingAction {
  /** Identificador do plano. Único por pedido. */
  readonly id: string;
  readonly code: string;
  readonly actionKind: string;
  readonly clientSlug: string;
  /** Descrição legível — é o que o dono lê antes de confirmar. */
  readonly summary: string;
  readonly payload: unknown;
  /** Quem pediu. Número do WhatsApp já mascarado, nunca completo. */
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export type ConfirmationResult =
  | { readonly ok: true; readonly action: PendingAction }
  | {
      readonly ok: false;
      readonly reason: 'not_found' | 'expired' | 'mismatch' | 'wrong_requester';
      readonly message: string;
    };

/**
 * Deriva o código do conteúdo do plano.
 *
 * `salt` entra na conta para que dois pedidos idênticos em sequência não
 * produzam o mesmo código — senão um código antigo, ainda na tela do celular,
 * confirmaria um plano novo que o dono não leu.
 */
export function deriveCode(payload: unknown, actionKind: string, clientSlug: string, salt: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ actionKind, clientSlug, payload, salt }))
    .digest();

  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[(digest[i] as number) % ALPHABET.length];
  }
  return code;
}

/** Compara em tempo constante, sem vazar em quantos caracteres divergiu. */
function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a.trim().toUpperCase(), 'utf8');
  const bufB = Buffer.from(b.trim().toUpperCase(), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface ConfirmationStoreOptions {
  readonly ttlMs?: number;
  /** Injetável para teste. Produção usa `() => new Date()`. */
  readonly now?: () => Date;
}

/**
 * Guarda ações à espera de confirmação.
 *
 * Em memória de propósito nesta fase: uma confirmação pendente não deve
 * sobreviver a um reinício do processo. Se o serviço caiu entre o plano e a
 * confirmação, o estado que o plano fotografou já não é confiável — melhor o
 * dono pedir de novo do que confirmar às cegas.
 */
export class ConfirmationStore {
  readonly #pending = new Map<string, PendingAction>();
  readonly #ttlMs: number;
  readonly #now: () => Date;

  constructor(options: ConfirmationStoreOptions = {}) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.#now = options.now ?? (() => new Date());
  }

  /** Registra um plano e devolve o código que o dono precisa repetir. */
  create(input: {
    readonly actionKind: string;
    readonly clientSlug: string;
    readonly summary: string;
    readonly payload: unknown;
    readonly requestedBy: string;
  }): PendingAction {
    const now = this.#now();
    const salt = randomBytes(8).toString('hex');
    const pending: PendingAction = {
      id: salt,
      code: deriveCode(input.payload, input.actionKind, input.clientSlug, salt),
      actionKind: input.actionKind,
      clientSlug: input.clientSlug,
      summary: input.summary,
      payload: input.payload,
      requestedBy: input.requestedBy,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.#ttlMs),
    };
    this.#pending.set(pending.code, pending);
    return pending;
  }

  /**
   * Confirma por código.
   *
   * `requestedBy` é conferido: quem confirma tem de ser quem pediu. Sem isso,
   * num grupo ou com o número comprometido, outra pessoa poderia confirmar uma
   * ação que não pediu — bastaria ler o código na tela.
   *
   * A confirmação é consumida no uso, valha ou não. Código não se reaproveita.
   */
  confirm(code: string, requestedBy: string): ConfirmationResult {
    const normalized = code.trim().toUpperCase();
    const found = [...this.#pending.values()].find((p) => codesMatch(p.code, normalized));

    if (found === undefined) {
      return {
        ok: false,
        reason: 'not_found',
        message: 'Código não confere com nenhuma ação pendente.',
      };
    }

    this.#pending.delete(found.code);

    if (this.#now() > found.expiresAt) {
      return {
        ok: false,
        reason: 'expired',
        message: 'Esse código expirou. Peça a ação de novo para ver o plano atualizado.',
      };
    }

    if (found.requestedBy !== requestedBy) {
      return {
        ok: false,
        reason: 'wrong_requester',
        message: 'Quem confirma precisa ser quem pediu.',
      };
    }

    // Última defesa: o código tem de continuar derivável do plano guardado.
    // Só falha se o plano foi adulterado em memória depois de criado.
    const recomputed = deriveCode(found.payload, found.actionKind, found.clientSlug, found.id);
    if (!codesMatch(recomputed, found.code)) {
      return {
        ok: false,
        reason: 'mismatch',
        message: 'O plano mudou depois de criado. Execução recusada.',
      };
    }

    return { ok: true, action: found };
  }

  /** Remove o que expirou. Chamado por rotina, não por caminho de decisão. */
  prune(): number {
    const now = this.#now();
    let removed = 0;
    for (const [code, pending] of this.#pending) {
      if (now > pending.expiresAt) {
        this.#pending.delete(code);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.#pending.size;
  }
}
