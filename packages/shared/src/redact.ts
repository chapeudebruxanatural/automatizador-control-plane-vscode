/**
 * Redação de dados sensíveis antes de qualquer serialização.
 *
 * Duas defesas independentes, porque cada uma falha de um jeito:
 *
 * 1. Por NOME do campo — pega `password`, `apiKey`, `authorization`, mesmo que
 *    o valor não pareça nada de especial.
 * 2. Por FORMATO do valor — pega um token do GitHub que alguém colocou num
 *    campo chamado `id`, ou que veio dentro da mensagem de uma exceção.
 *
 * A segunda existe porque a primeira depende de quem nomeou o campo, e erros de
 * integração costumam carregar o header de autenticação no corpo da resposta.
 */

export const REDACTED = '[REDACTED]';

const MAX_DEPTH = 8;

/** Nomes de campo cujo valor nunca deve ser serializado. */
const SENSITIVE_KEY =
  /(pass(word|wd)?|senha|secret|token|api[-_]?key|apikey|authorization|credential|private[-_]?key|client[-_]?secret|refresh[-_]?token|access[-_]?token|cookie|session[-_]?id|signature|passphrase)/i;

/** Assinaturas de segredo reconhecíveis pelo próprio formato do valor. */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{16,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /sk-(proj-)?[A-Za-z0-9_-]{24,}/,
  /(A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /GOCSPX-[A-Za-z0-9_-]{20,}/,
  /EAA[A-Za-z0-9]{40,}/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\./,
];

/**
 * URL com credencial embutida.
 *
 * Tratada à parte porque aqui a substituição cega perderia informação útil: o
 * esquema e o host dizem *qual* banco estava envolvido, e isso costuma ser o
 * dado mais valioso de uma mensagem de erro. Preservamos os dois e apagamos
 * apenas usuário e senha.
 */
const CREDENTIALED_URL =
  /\b(postgres|postgresql|mysql|mongodb|redis|amqp|ftp|ssh):\/\/[^:@/\s]+:[^@/\s]+@/g;

/** Substitui por `[REDACTED]` qualquer trecho com formato de segredo. */
export function redactString(value: string): string {
  let out = value.replace(CREDENTIALED_URL, `$1://${REDACTED}@`);
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, 'g'), REDACTED);
  }
  return out;
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/**
 * Percorre a estrutura e devolve uma cópia segura para log.
 *
 * Referências circulares viram `[Circular]` e profundidade excessiva vira
 * `[Truncated]` — um logger que estoura a pilha derruba justamente o processo
 * que deveria estar registrando o problema.
 */
export function redact(input: unknown): unknown {
  return walk(input, 0, new WeakSet<object>());
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[Truncated]';

  if (value === null || value === undefined) return value;

  const type = typeof value;
  if (type === 'string') return redactString(value as string);
  if (type === 'number' || type === 'boolean' || type === 'bigint') return value;
  if (type === 'function') return '[Function]';
  if (type === 'symbol') return value.toString();

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack === undefined ? undefined : redactString(value.stack),
    };
  }

  if (typeof value === 'object') {
    const obj = value as object;
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);

    if (Array.isArray(value)) {
      return value.map((item) => walk(item, depth + 1, seen));
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : walk(item, depth + 1, seen);
    }
    return out;
  }

  return String(value);
}
