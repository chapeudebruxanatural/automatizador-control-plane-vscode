/**
 * Normalização das respostas da API da Cloudflare para o formato de inventário.
 *
 * Separado do cliente HTTP de propósito: o parser é puro e testável sem rede,
 * sem credencial e sem mock de servidor. Isso importa porque o formato da API
 * é a parte que mais muda, e é onde erros silenciosos entram.
 *
 * Regra que atravessa o arquivo: **nunca** propagar valor de credencial para o
 * inventário. Um registro DNS pode conter um token em TXT (verificação de
 * domínio, DKIM). O conteúdo de TXT é truncado e marcado, nunca copiado.
 */

import type { VerificationStatus } from '../../../domain/src/verification.js';

export interface CloudflareZone {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly paused: boolean;
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly nameServers: readonly string[];
  readonly verificationStatus: VerificationStatus;
}

export interface CloudflareDnsRecord {
  readonly id: string;
  readonly zoneName: string;
  readonly type: string;
  readonly name: string;
  /** Ausente em tipos sensíveis. Ver `redactRecordContent`. */
  readonly content?: string;
  readonly proxied: boolean;
  readonly ttl: number;
  readonly pointsToVps: boolean;
}

export interface NormalizedInventory {
  readonly zones: readonly CloudflareZone[];
  readonly records: readonly CloudflareDnsRecord[];
  readonly duplicateZoneNames: readonly string[];
  readonly apexByZone: Readonly<Record<string, string | null>>;
}

/** Tipos de registro cujo conteúdo pode carregar segredo. */
const SENSITIVE_RECORD_TYPES = new Set(['TXT', 'SPF', 'CAA', 'SSHFP', 'TLSA']);

/**
 * TXT carrega verificação de domínio, DKIM e às vezes token de API.
 * O inventário precisa saber que o registro existe e qual o tipo — nunca o
 * valor. Para os demais tipos, o conteúdo é o próprio alvo e é informação útil.
 */
export function redactRecordContent(type: string, content: string): string | undefined {
  if (SENSITIVE_RECORD_TYPES.has(type.toUpperCase())) return undefined;
  return content;
}

export function parseZones(raw: unknown): readonly CloudflareZone[] {
  const list = extractResultArray(raw);

  return list.map((item) => {
    const z = item as Record<string, unknown>;
    const account = (z['account'] ?? {}) as Record<string, unknown>;
    return {
      id: str(z['id']),
      name: str(z['name']).toLowerCase(),
      status: str(z['status']) || 'unknown',
      paused: z['paused'] === true,
      accountId: z['account'] ? str(account['id']) || null : null,
      accountName: z['account'] ? str(account['name']) || null : null,
      nameServers: Array.isArray(z['name_servers'])
        ? (z['name_servers'] as unknown[]).map(str).filter(Boolean)
        : [],
      verificationStatus: 'verified' as const,
    };
  });
}

export function parseDnsRecords(
  raw: unknown,
  zoneName: string,
  vpsAddresses: readonly string[] = [],
): readonly CloudflareDnsRecord[] {
  const list = extractResultArray(raw);
  const vps = new Set(vpsAddresses);

  return list.map((item) => {
    const r = item as Record<string, unknown>;
    const type = str(r['type']).toUpperCase();
    const content = str(r['content']);
    const redacted = redactRecordContent(type, content);

    return {
      id: str(r['id']),
      zoneName,
      type,
      name: str(r['name']).toLowerCase(),
      ...(redacted === undefined ? {} : { content: redacted }),
      proxied: r['proxied'] === true,
      ttl: typeof r['ttl'] === 'number' ? r['ttl'] : 1,
      pointsToVps: (type === 'A' || type === 'AAAA') && vps.has(content),
    };
  });
}

/**
 * Zonas com o mesmo nome.
 *
 * Existe porque o dono relatou ver `encantariaartesanal.com` duas vezes no
 * painel. Duas zonas com o mesmo nome em contas diferentes é um problema real
 * — só uma responde, e descobrir qual costuma acontecer durante um incidente.
 *
 * A hipótese concorrente, mais provável, é que a segunda entrada seja o
 * subdomínio `painel.` (que o Traefik confirma existir) exibido separadamente.
 * Este detector distingue os dois casos com dados, em vez de supor.
 */
export function findDuplicateZoneNames(zones: readonly CloudflareZone[]): readonly string[] {
  const seen = new Map<string, number>();
  for (const zone of zones) {
    seen.set(zone.name, (seen.get(zone.name) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name).sort();
}

/** Registro apex (raiz) de cada zona, quando existe. */
export function findApexRecords(
  records: readonly CloudflareDnsRecord[],
): Readonly<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const record of records) {
    if (record.name !== record.zoneName) continue;
    if (record.type !== 'A' && record.type !== 'AAAA' && record.type !== 'CNAME') continue;
    out[record.zoneName] = record.content ?? null;
  }
  return out;
}

export function normalize(
  rawZones: unknown,
  rawRecordsByZone: ReadonlyMap<string, unknown>,
  vpsAddresses: readonly string[] = [],
): NormalizedInventory {
  const zones = parseZones(rawZones);
  const records: CloudflareDnsRecord[] = [];

  for (const zone of zones) {
    const raw = rawRecordsByZone.get(zone.name) ?? rawRecordsByZone.get(zone.id);
    if (raw === undefined) continue;
    records.push(...parseDnsRecords(raw, zone.name, vpsAddresses));
  }

  return {
    zones,
    records,
    duplicateZoneNames: findDuplicateZoneNames(zones),
    apexByZone: findApexRecords(records),
  };
}

// --- utilitários -------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * A API da Cloudflare devolve `{ success, result: [...] }`. Aceitamos também um
 * array direto, para simplificar teste e uso de fixture.
 *
 * Entrada inesperada devolve lista vazia em vez de lançar: um inventário
 * incompleto é recuperável, um processo que morre no meio de uma varredura de
 * 8 zonas não é.
 */
function extractResultArray(raw: unknown): readonly unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw !== null && typeof raw === 'object') {
    const result = (raw as Record<string, unknown>)['result'];
    if (Array.isArray(result)) return result;
  }
  return [];
}
