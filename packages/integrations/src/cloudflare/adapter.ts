/** Adaptador real da Cloudflare, deliberadamente sem qualquer método mutante. */

import type {
  AdapterHealth,
  CloudflareAdapter,
  DnsRecordSummary,
  ZoneSummary,
} from '../ports/adapters.js';
import type { CloudflareReadClient } from './client.js';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function createCloudflareReadAdapter(client: CloudflareReadClient): CloudflareAdapter {
  return {
    name: 'cloudflare',
    enabled: true,

    async health(): Promise<AdapterHealth> {
      try {
        await client.listZones();
        return {
          reachable: true,
          detail: 'Cloudflare respondeu à leitura de zonas.',
          checkedAt: new Date().toISOString(),
        };
      } catch {
        return {
          reachable: false,
          detail: 'Cloudflare não respondeu à leitura. Nenhuma escrita foi tentada.',
          checkedAt: new Date().toISOString(),
        };
      }
    },

    async listZones(): Promise<readonly ZoneSummary[]> {
      const zones = await client.listZones();
      return zones.map((item) => {
        const zone = record(item);
        return { id: text(zone['id']), name: text(zone['name']), status: text(zone['status']) };
      });
    },

    async listDnsRecords(zoneId: string): Promise<readonly DnsRecordSummary[]> {
      const records = await client.listDnsRecords(zoneId);
      return records.map((item) => {
        const dns = record(item);
        return {
          id: text(dns['id']),
          type: text(dns['type']),
          name: text(dns['name']),
          proxied: dns['proxied'] === true,
        };
      });
    },
  };
}
