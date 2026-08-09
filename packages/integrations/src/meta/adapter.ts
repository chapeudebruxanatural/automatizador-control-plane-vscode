/** Adaptador real da Meta, com leitura habilitada e escrita recusada. */

import type {
  AdAccountSummary,
  AdapterHealth,
  CampaignSummary,
  MetaAdapter,
} from '../ports/adapters.js';
import type { MetaReadClient } from './client.js';

const WRITE_DISABLED =
  'Escrita na Meta não está implementada no adaptador de leitura. O kill switch permanece ligado.';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function cents(value: unknown): number | null {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function createMetaReadAdapter(client: MetaReadClient): MetaAdapter {
  return {
    name: 'meta',
    enabled: true,

    async health(): Promise<AdapterHealth> {
      try {
        await client.listAdAccounts();
        return {
          reachable: true,
          detail: 'Meta respondeu à leitura de contas de anúncios.',
          checkedAt: new Date().toISOString(),
        };
      } catch {
        return {
          reachable: false,
          detail: 'Meta não respondeu à leitura. Nenhuma escrita foi tentada.',
          checkedAt: new Date().toISOString(),
        };
      }
    },

    async listAdAccounts(): Promise<readonly AdAccountSummary[]> {
      const accounts = await client.listAdAccounts();
      return accounts.map((item) => {
        const account = record(item);
        const id = text(account['id']);
        return {
          id,
          name: text(account['name']),
          status: text(account['account_status']),
          currency: text(account['currency']),
          queryable: /^act_\d+$/.test(id),
        };
      });
    },

    async listCampaigns(adAccountId: string): Promise<readonly CampaignSummary[]> {
      const campaigns = await client.listCampaigns(adAccountId);
      return campaigns.map((item) => {
        const campaign = record(item);
        return {
          id: text(campaign['id']),
          name: text(campaign['name']),
          status: text(campaign['status']),
          dailyBudgetCents: cents(campaign['daily_budget']),
        };
      });
    },

    pauseCampaign: (_campaignId: string) => Promise.reject(new Error(WRITE_DISABLED)),
  };
}
