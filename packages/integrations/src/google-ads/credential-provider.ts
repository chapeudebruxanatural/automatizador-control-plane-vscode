/**
 * Provedor de credenciais do Google Ads.
 *
 * Carrega a chave de conta de serviço **pelo caminho protegido**, fora do Git.
 * O valor nunca é devolvido, logado, serializado ou comparado — o provedor
 * expõe apenas *existência* e *metadados*, e entrega o caminho para a
 * biblioteca cliente abrir por conta própria.
 *
 * ## Por que o caminho, e não o conteúdo
 *
 * A biblioteca oficial do Google aceita um caminho de arquivo
 * (`GOOGLE_APPLICATION_CREDENTIALS`). Passar o caminho em vez de ler o JSON
 * significa que o conteúdo da chave privada nunca entra no espaço de memória
 * deste código, nunca passa por um logger, e nunca corre risco de acabar em
 * um `JSON.stringify` de diagnóstico.
 *
 * ## Estado nesta máquina
 *
 * O projeto anterior (`google-ads-automation`) e o diretório de segredos
 * vivem no **notebook do dono**, não nesta máquina. Confirmado por busca:
 * `~/Documents/Codex` existe mas contém apenas pastas de sessão datadas, sem
 * o projeto e sem `.secrets/`. Portanto `authMode` resolve para `unavailable`
 * aqui, e `liveReadVerified` permanece `false` até rodar no notebook.
 */

import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

export type AuthMode = 'service_account' | 'user_oauth' | 'unavailable';

export interface GoogleAdsCredentialStatus {
  readonly authMode: AuthMode;
  /** Caminho ou identificador. **Nunca** o valor. */
  readonly credentialReference: string | null;
  readonly developerTokenConfigured: boolean;
  readonly loginCustomerIdConfigured: boolean;
  readonly liveReadVerified: boolean;
  /** Só metadados: modo, dono, tamanho. Nunca conteúdo. */
  readonly keyFileMode?: string;
  readonly keyFileOwnerUid?: number;
  readonly unavailableReason?: string;
}

/** Caminho padrão do diretório protegido, no notebook do dono. */
export const DEFAULT_SECRET_DIR = resolve(homedir(), 'Documents/Codex/.secrets/google-ads');

export interface CredentialProviderOptions {
  /** Sobrescrevível para teste e para outra máquina. */
  readonly secretDir?: string;
  readonly env?: Record<string, string | undefined>;
}

/**
 * Identificadores da estrutura. **Não são segredos** — são números de conta,
 * equivalentes a um número de agência bancária: identificam, não autorizam.
 */
export const MCC_LOGIN_CUSTOMER_ID = '3992594849';
export const ADVERTISER_CUSTOMER_ID = '2656966896';

/**
 * Localiza a chave de conta de serviço sem abri-la.
 *
 * Procura por nomes plausíveis em vez de exigir um exato, porque o arquivo foi
 * criado em outra máquina e o nome não foi informado. Devolve o primeiro que
 * existir e for legível.
 */
async function findServiceAccountKey(
  secretDir: string,
  explicitPath?: string,
): Promise<string | null> {
  // Caminho explícito ganha do diretório padrão.
  //
  // Existe para CI: no runner não há `~/Documents/Codex/.secrets`, a chave é
  // materializada num arquivo temporário e o caminho chega por
  // GOOGLE_ADS_KEY_PATH. Também serve para quem roda em outra máquina.
  //
  // Se o caminho foi declarado e não serve, devolve null em vez de cair no
  // diretório padrão: cair de volta silenciosamente leria uma credencial que
  // não é a pedida, e numa conta compartilhada isso é a diferença entre
  // operar o cliente certo e o errado.
  if (explicitPath !== undefined && explicitPath !== '') {
    try {
      await access(explicitPath, constants.R_OK);
      return explicitPath;
    } catch {
      return null;
    }
  }

  const candidates = [
    'service-account.json',
    'google-ads-automation.json',
    'credentials.json',
    'key.json',
    'automatizador-ia-ads.json',
  ];

  for (const name of candidates) {
    const candidate = resolve(secretDir, name);
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch {
      // Ausente ou ilegível: tenta o próximo. Não há o que registrar.
    }
  }
  return null;
}

/**
 * Descreve o estado das credenciais **sem tocar no valor de nenhuma**.
 *
 * Falha fechada: qualquer coisa que impeça a determinação resolve para
 * `unavailable`, nunca para "provavelmente funciona".
 */
export async function describeCredentials(
  options: CredentialProviderOptions = {},
): Promise<GoogleAdsCredentialStatus> {
  const env = options.env ?? process.env;
  const secretDir = options.secretDir ?? DEFAULT_SECRET_DIR;

  const developerTokenConfigured = isPresent(env['GOOGLE_ADS_DEVELOPER_TOKEN']);
  const loginCustomerIdConfigured =
    isPresent(env['GOOGLE_ADS_LOGIN_CUSTOMER_ID']) || true; // constante conhecida acima

  const base = {
    developerTokenConfigured,
    loginCustomerIdConfigured,
    liveReadVerified: false as const,
  };

  // O caminho explícito é consultado ANTES da checagem do diretório protegido.
  //
  // A ordem importa: em CI não existe `~/Documents/Codex/.secrets` nenhum, e
  // exigir o diretório primeiro faria a credencial ser declarada indisponível
  // mesmo com a chave materializada e legível no caminho declarado.
  const explicitPath = env['GOOGLE_ADS_KEY_PATH'];
  const hasExplicitPath = explicitPath !== undefined && explicitPath !== '';

  if (!hasExplicitPath) {
    let dirExists = false;
    try {
      const info = await stat(secretDir);
      dirExists = info.isDirectory();
    } catch {
      dirExists = false;
    }

    if (!dirExists) {
      return {
        ...base,
        authMode: 'unavailable',
        credentialReference: null,
        unavailableReason: `diretório protegido não encontrado nesta máquina: ${secretDir}`,
      };
    }
  }

  const keyPath = await findServiceAccountKey(secretDir, explicitPath);
  if (keyPath === null) {
    return {
      ...base,
      authMode: 'unavailable',
      credentialReference: null,
      unavailableReason: hasExplicitPath
        ? `chave declarada em GOOGLE_ADS_KEY_PATH não é legível: ${explicitPath}`
        : `nenhuma chave de conta de serviço legível em ${secretDir}`,
    };
  }

  // Metadados apenas. O arquivo NÃO é aberto.
  const info = await stat(keyPath);
  const mode = (info.mode & 0o777).toString(8).padStart(3, '0');

  return {
    ...base,
    authMode: 'service_account',
    credentialReference: keyPath,
    keyFileMode: mode,
    keyFileOwnerUid: info.uid,
  };
}

/**
 * Avisa quando a permissão do arquivo de chave está frouxa.
 *
 * Uma chave de conta de serviço legível por outros usuários é uma chave
 * comprometida em potencial. Isto é aviso, não bloqueio: quem decide o que
 * fazer é o dono.
 */
export function keyPermissionWarning(status: GoogleAdsCredentialStatus): string | null {
  if (status.keyFileMode === undefined) return null;
  const mode = Number.parseInt(status.keyFileMode, 8);
  const groupOrOther = mode & 0o077;
  if (groupOrOther === 0) return null;
  return `chave com permissão ${status.keyFileMode}: legível além do dono. Esperado 600.`;
}

function isPresent(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}
