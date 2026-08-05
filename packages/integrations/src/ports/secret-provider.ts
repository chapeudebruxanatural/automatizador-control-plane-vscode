/**
 * Acesso a segredos.
 *
 * Existe para que o resto do código nunca precise saber *onde* um segredo mora
 * — keychain do sistema, `.env`, ou um cofre gerenciado no futuro. Trocar a
 * origem passa a ser trocar a implementação.
 *
 * Contrato de uso, em três regras:
 *
 * 1. O valor devolvido **nunca** é registrado em log, auditoria ou inventário.
 * 2. `has()` existe para que se possa relatar configuração ausente sem tocar no
 *    valor. `/status` usa isso: reporta presença, não conteúdo.
 * 3. `get()` lança quando o segredo não existe. Devolver string vazia
 *    produziria uma chamada autenticada com credencial em branco, e um erro
 *    confuso lá na frente em vez de um erro claro aqui.
 */

export interface SecretProvider {
  readonly name: string;
  has(key: string): Promise<boolean>;
  get(key: string): Promise<string>;
  /** Apenas os NOMES disponíveis. Nunca os valores. */
  listKeys(): Promise<readonly string[]>;
}

export class SecretNotFoundError extends Error {
  constructor(key: string) {
    super(`Segredo não configurado: ${key}`);
    this.name = 'SecretNotFoundError';
  }
}

/**
 * Implementação sobre variáveis de ambiente.
 *
 * `listKeys()` filtra por prefixos conhecidos de integração em vez de devolver
 * o ambiente inteiro — listar tudo transformaria um utilitário de diagnóstico
 * em um mapa da superfície de ataque.
 */
export function createEnvSecretProvider(
  env: Record<string, string | undefined> = process.env,
): SecretProvider {
  const KNOWN_PREFIXES = [
    'GITHUB_',
    'VPS_',
    'N8N_',
    'CLOUDFLARE_',
    'GOOGLE_',
    'META_',
    'WHATSAPP_',
  ];

  const present = (key: string): boolean => {
    const value = env[key];
    return value !== undefined && value.trim() !== '';
  };

  return {
    name: 'env',
    has: (key) => Promise.resolve(present(key)),
    get: (key) => {
      if (!present(key)) return Promise.reject(new SecretNotFoundError(key));
      return Promise.resolve(env[key] as string);
    },
    listKeys: () =>
      Promise.resolve(
        Object.keys(env)
          .filter((k) => KNOWN_PREFIXES.some((p) => k.startsWith(p)) && present(k))
          .sort(),
      ),
  };
}
