#!/usr/bin/env node
/**
 * Coleta reproduzível da Cloudflare, estritamente por GET.
 *
 * A saída é JSON sanitizado em stdout. O script não escreve no repositório e
 * nunca inclui o token ou conteúdo de registros DNS sensíveis.
 */

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

import {
  CloudflareReadClient,
  loadCloudflareApiToken,
} from '../packages/integrations/src/cloudflare/client.js';
import { normalize } from '../packages/integrations/src/cloudflare/parser.js';

interface CloudflareInventoryFile {
  readonly account?: { readonly accountId?: string };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const current = parseYaml(
  await readFile(new URL('../inventory/cloudflare.yaml', import.meta.url), 'utf8'),
) as CloudflareInventoryFile;

const accountId =
  process.env['CLOUDFLARE_ACCOUNT_ID']?.trim() || current.account?.accountId?.trim() || '';
if (accountId === '') throw new Error('CLOUDFLARE_ACCOUNT_ID ausente e inventário sem accountId');

const token = await loadCloudflareApiToken();
const client = new CloudflareReadClient({ accountId, token });
const rawZones = await client.listZones();

const recordsByZone = new Map<string, unknown>();
for (const item of rawZones) {
  const zone = (item ?? {}) as Record<string, unknown>;
  const id = text(zone['id']);
  const name = text(zone['name']);
  if (id === '' || name === '') continue;
  recordsByZone.set(name, await client.listDnsRecords(id));
}

const [pages, workers, workerDomains, tunnels] = await Promise.all([
  client.listPagesProjects(),
  client.listWorkerScripts(),
  client.listWorkerDomains(),
  client.listTunnels(),
]);

const normalized = normalize(rawZones, recordsByZone);

const output = {
  meta: {
    collectedAt: new Date().toISOString(),
    source: 'Cloudflare API (somente leitura)',
    accountId,
    changesMade: 0,
  },
  ...normalized,
  pages: pages.map((item) => {
    const p = (item ?? {}) as Record<string, unknown>;
    const source = (p['source'] ?? null) as Record<string, unknown> | null;
    const config = (source?.['config'] ?? null) as Record<string, unknown> | null;
    return {
      name: text(p['name']),
      subdomain: text(p['subdomain']),
      productionBranch: text(p['production_branch']) || null,
      domains: Array.isArray(p['domains']) ? p['domains'].map(text).filter(Boolean) : [],
      source:
        source === null
          ? null
          : {
              type: text(source['type']) || null,
              owner: text(config?.['owner']) || null,
              repository: text(config?.['repo_name']) || null,
            },
    };
  }),
  workers: workers.map((item) => {
    const w = (item ?? {}) as Record<string, unknown>;
    return {
      id: text(w['id']),
      createdOn: text(w['created_on']) || null,
      modifiedOn: text(w['modified_on']) || null,
    };
  }),
  workerDomains: workerDomains.map((item) => {
    const d = (item ?? {}) as Record<string, unknown>;
    return {
      hostname: text(d['hostname']),
      service: text(d['service']),
      environment: text(d['environment']) || null,
      zoneName: text(d['zone_name']) || null,
    };
  }),
  tunnels: tunnels.map((item) => {
    const t = (item ?? {}) as Record<string, unknown>;
    return {
      id: text(t['id']),
      name: text(t['name']),
      status: text(t['status']) || null,
      createdAt: text(t['created_at']) || null,
    };
  }),
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
