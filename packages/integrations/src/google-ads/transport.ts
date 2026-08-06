/**
 * Transporte real para a Google Ads API, sobre `fetch` e `node:crypto`.
 *
 * Sem SDK: o projeto tem uma única dependência de runtime (zod), e a
 * superfície de supply chain importa num processo que segura credenciais de
 * produção. O que a API exige é um JWT assinado, uma troca por access token e
 * chamadas REST — tudo isso o Node faz nativamente.
 *
 * ## O segredo nunca é exposto
 *
 * A chave privada é lida do arquivo, usada para assinar o JWT, e descartada.
 * Não é logada, não é devolvida, não entra em mensagem de erro: `sanitize()`
 * limpa qualquer resposta antes de virar exceção.
 *
 * ## Leitura e escrita, com fronteira clara
 *
 * `searchStream` e `listAccessibleCustomers` sao leitura. `mutate` existe,
 * mas so e alcancado pelo GoogleAdsWriteAdapter, que exige plano validado com
 * validateOnly e hash aprovado antes de executar. `assertReadOnlyQuery` segue
 * recusando GAQL que nao comece com SELECT.
 */

import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';
import type { GoogleAdsMutateTransport } from './write-adapter.js';


/**
 * Versão da API.
 *
 * Em 05/08/2026 a v21 começou a devolver `UNSUPPORTED_VERSION` de forma
 * intermitente ("Version v21 is deprecated. Requests to this version will be
 * blocked") — o Google faz o bloqueio em rollout, então a mesma consulta
 * alternava entre 200 e 400. Toda a integração ficou instável.
 *
 * A v22 é a escolha deliberada, não a mais nova. Testadas contra a conta real,
 * v22 a v25 respondem a todas as consultas em uso — mas a partir da **v23** os
 * campos `campaign.start_date` e `campaign.end_date` devolvem
 * `UNRECOGNIZED_FIELD`, e é exatamente por eles que o plano de recuperação do
 * Cássio estende a data final da campanha.
 *
 * Ou seja: subir direto para a v25 não quebraria o build nem os testes — só
 * quebraria a operação de data, em produção, silenciosamente. A v22 é o menor
 * passo para fora da versão bloqueada que preserva o que já funciona.
 *
 * Para migrar adiante é preciso primeiro descobrir o substituto dos campos de
 * data e ajustar o write-adapter.
 */
export const GOOGLE_ADS_API_VERSION = 'v22';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

interface ServiceAccountKey {
  readonly client_email: string;
  readonly private_key: string;
  readonly token_uri?: string;
}

/** Remove qualquer coisa com cara de credencial antes de virar mensagem de erro. */
function sanitize(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[REDACTED]')
    .replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token":"[REDACTED]"')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[REDACTED]');
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Assina o JWT de conta de serviço.
 *
 * `subject` implementa a delegação em todo o domínio: quando presente, o
 * token é emitido *em nome* daquele usuário. Sem Workspace isso falha, e o
 * erro devolvido diz exatamente isso — é o sinal de que o caminho real é
 * OAuth de usuário, não conta de serviço.
 */
function buildAssertion(key: ServiceAccountKey, subject?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims: Record<string, unknown> = {
    iss: key.client_email,
    scope: ADS_SCOPE,
    aud: key.token_uri ?? TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  if (subject !== undefined && subject !== '') claims['sub'] = subject;

  const payload = b64url(JSON.stringify(claims));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = b64url(signer.sign(key.private_key));
  return `${header}.${payload}.${signature}`;
}

export interface TransportConfig {
  readonly keyPath: string;
  readonly developerToken: string;
  readonly loginCustomerId: string;
  /** E-mail para delegação em todo o domínio. Exige Google Workspace. */
  readonly impersonateSubject?: string;
}

export class GoogleAdsAuthError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
    this.name = 'GoogleAdsAuthError';
  }
}

export async function createGoogleAdsTransport(
  config: TransportConfig,
): Promise<GoogleAdsMutateTransport> {
  if (!config.developerToken) {
    throw new GoogleAdsAuthError(
      'developer token ausente',
      'Grave GOOGLE_ADS_DEVELOPER_TOKEN no .env.',
    );
  }

  // A chave é lida aqui e só sai daqui como assinatura.
  const raw = await readFile(config.keyPath, 'utf8');
  let key: ServiceAccountKey;
  try {
    key = JSON.parse(raw) as ServiceAccountKey;
  } catch {
    throw new GoogleAdsAuthError(`chave inválida em ${config.keyPath}`);
  }
  if (!key.client_email || !key.private_key) {
    throw new GoogleAdsAuthError('chave sem client_email ou private_key');
  }

  let cachedToken: { value: string; expiresAt: number } | null = null;

  const getAccessToken = async (): Promise<string> => {
    if (cachedToken !== null && cachedToken.expiresAt > Date.now() + 60_000) {
      return cachedToken.value;
    }

    const assertion = buildAssertion(key, config.impersonateSubject);
    const res = await fetch(key.token_uri ?? TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      const clean = sanitize(body);
      // O erro mais provável aqui, e o mais informativo.
      const hint = /unauthorized_client|invalid_grant/i.test(clean)
        ? 'Conta de serviço sem delegação em todo o domínio, ou não autorizada no Google Ads. ' +
          'Sem Google Workspace esse fluxo não funciona: o caminho real é OAuth de usuário. ' +
          'Alternativa: adicionar o e-mail da conta de serviço como usuário da conta do Google Ads.'
        : undefined;
      throw new GoogleAdsAuthError(`falha ao obter access token (HTTP ${res.status}): ${clean}`, hint);
    }

    const parsed = JSON.parse(body) as { access_token?: string; expires_in?: number };
    if (!parsed.access_token) throw new GoogleAdsAuthError('resposta sem access_token');

    cachedToken = {
      value: parsed.access_token,
      expiresAt: Date.now() + (parsed.expires_in ?? 3600) * 1000,
    };
    return cachedToken.value;
  };

  const headers = async (): Promise<Record<string, string>> => ({
    authorization: `Bearer ${await getAccessToken()}`,
    'developer-token': config.developerToken,
    'login-customer-id': config.loginCustomerId.replace(/\D/g, ''),
    'content-type': 'application/json',
  });

  const base = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

  return {
    apiVersion: GOOGLE_ADS_API_VERSION,

    async listAccessibleCustomers() {
      const res = await fetch(`${base}/customers:listAccessibleCustomers`, {
        method: 'GET',
        headers: await headers(),
      });
      const body = await res.text();
      const requestId = res.headers.get('request-id') ?? 'sem-request-id';
      if (!res.ok) {
        throw new GoogleAdsAuthError(
          `listAccessibleCustomers falhou (HTTP ${res.status}, request-id ${requestId}): ${sanitize(body)}`,
        );
      }
      const parsed = JSON.parse(body) as { resourceNames?: string[] };
      return { resourceNames: parsed.resourceNames ?? [], requestId };
    },

    /**
     * Escrita. `validateOnly: true` valida SEM executar — e o padrao do
     * fluxo de plano. Executar de verdade exige validateOnly: false, o que
     * so acontece via GoogleAdsWriteAdapter.execute() com hash aprovado.
     */
    async mutate(_customerId: string, endpoint: string, payload: unknown, validateOnly: boolean) {
      const body = { ...(payload as Record<string, unknown>), validateOnly };
      const res = await fetch(`${base}/${endpoint}`, {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify(body),
      });
      const text = await res.text();
      const requestId = res.headers.get('request-id') ?? 'sem-request-id';
      if (!res.ok) {
        throw new GoogleAdsAuthError(
          `mutate ${validateOnly ? '(validateOnly)' : '(EXECUCAO)'} falhou ` +
            `(HTTP ${res.status}, request-id ${requestId}): ${sanitize(text)}`,
        );
      }
      return { response: text === '' ? {} : JSON.parse(text), requestId };
    },

    async searchStream(customerId, query) {
      const res = await fetch(`${base}/customers/${customerId}/googleAds:searchStream`, {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({ query }),
      });
      const body = await res.text();
      const requestId = res.headers.get('request-id') ?? 'sem-request-id';
      if (!res.ok) {
        throw new GoogleAdsAuthError(
          `searchStream falhou (HTTP ${res.status}, request-id ${requestId}): ${sanitize(body)}`,
        );
      }
      // searchStream devolve um array de chunks, cada um com `results`.
      const chunks = JSON.parse(body) as { results?: Record<string, unknown>[] }[];
      const rows = chunks.flatMap((c) => c.results ?? []);
      return { rows, requestId };
    },
  };
}
