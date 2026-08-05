/**
 * Rate limit e deduplicação por número.
 *
 * Duas defesas independentes contra a mesma classe de problema — webhook
 * duplicado ou reenviado, e uso abusivo (por engano ou não):
 *
 * - **Deduplicação**: mesmo `messageId` processado mais de uma vez é
 *   ignorado na segunda vez. Webhooks HTTP são reenviados por natureza
 *   (timeout, retry) — processar duas vezes um comando de leitura é inofensivo
 *   em si, mas quebra a garantia de auditoria "um evento, um registro".
 * - **Rate limit**: número que manda comando demais em pouco tempo é
 *   temporariamente recusado, independente de estar na allowlist.
 */

export interface RateLimiter {
  /** true = permitido, false = limite excedido */
  check(key: string): boolean;
}

export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
  now: () => number = Date.now,
): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key: string): boolean {
      const t = now();
      const windowStart = t - windowMs;
      const existing = (hits.get(key) ?? []).filter((ts) => ts > windowStart);

      if (existing.length >= maxRequests) {
        hits.set(key, existing);
        return false;
      }

      existing.push(t);
      hits.set(key, existing);
      return true;
    },
  };
}

export interface Deduplicator {
  /**
   * Consulta SEM marcar. Separado de `markSeen` de propósito.
   *
   * A versão anterior tinha um único `isNew()` que consultava e marcava no
   * mesmo passo, e era chamado ANTES do rate limit. Consequência: uma mensagem
   * barrada por rate limit já saía marcada como vista, e a retentativa
   * legítima — inclusive a reentrega automática da Evolution após timeout —
   * era descartada como duplicata. O comando se perdia em silêncio: o usuário
   * recebia "aguarde", esperava, reenviava, e não obtinha resposta nenhuma.
   *
   * Com a separação, só se marca o que foi de fato processado.
   */
  hasSeen(messageId: string): boolean;
  /** Marca como processado. Chamar apenas depois de passar por todos os portões. */
  markSeen(messageId: string): void;
}

export function createDeduplicator(capacity = 2000): Deduplicator {
  const seen = new Set<string>();
  const order: string[] = [];

  return {
    hasSeen: (messageId) => seen.has(messageId),

    markSeen(messageId: string): void {
      if (seen.has(messageId)) return;
      seen.add(messageId);
      order.push(messageId);
      if (order.length > capacity) {
        const oldest = order.shift();
        if (oldest !== undefined) seen.delete(oldest);
      }
    },
  };
}
