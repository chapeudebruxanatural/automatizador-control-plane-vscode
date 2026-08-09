/**
 * Relatório histórico do Cássio — SOMENTE LEITURA.
 *
 * Consulta apenas as cinco campanhas conhecidas e conta exclusivamente a ação
 * `WHATSAPP - CÁSSIO`. Cidade vem de `geographic_view` com
 * `segments.geo_target_city` (local de presença), resolvida contra
 * `geo_target_constant`. Nenhuma associação é inferida por nome.
 */

import {
  describeCredentials,
  loadGoogleAdsDeveloperToken,
} from '../packages/integrations/src/google-ads/credential-provider.js';
import { dataOperacionalGoogleAds } from '../packages/integrations/src/google-ads/budget-governor.js';
import { createGoogleAdsTransport } from '../packages/integrations/src/google-ads/transport.js';

const CUSTOMER_ID = '2656966896';
const LOGIN_CUSTOMER_ID = '3992594849';
const START_DATE = '2026-07-01';
const END_DATE = dataOperacionalGoogleAds();
const OBSERVED_AT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'medium',
}).format(new Date());
const WHATSAPP_ACTION = 'WHATSAPP - CÁSSIO';

const CAMPAIGN_IDS = [
  '24066140634',
  '24073903393',
  '24100207887',
  '24103008676',
  '24106867845',
] as const;
const CURRENT_CAMPAIGN_ID = '24106867845';
const SEARCH_CAMPAIGN_ID = '24073903393';

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' ? (value as RecordValue) : {};
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function displayCity(value: string): string {
  const accents: Readonly<Record<string, string>> = {
    Brasilia: 'Brasília',
    Goiania: 'Goiânia',
    'Sao Paulo': 'São Paulo',
  };
  return accents[value] ?? value;
}

const credentials = await describeCredentials();
if (credentials.authMode !== 'service_account' || credentials.credentialReference === null) {
  throw new Error('credencial Google Ads de leitura indisponível');
}

const transport = await createGoogleAdsTransport({
  keyPath: credentials.credentialReference,
  developerToken: await loadGoogleAdsDeveloperToken(),
  loginCustomerId: LOGIN_CUSTOMER_ID,
});

const idList = CAMPAIGN_IDS.join(',');
const totalsResult = await transport.searchStream(
  CUSTOMER_ID,
  `SELECT campaign.id, campaign.name, campaign.status, metrics.clicks,
          metrics.cost_micros, metrics.all_conversions
   FROM campaign
   WHERE campaign.id IN (${idList})
     AND segments.date BETWEEN '${START_DATE}' AND '${END_DATE}'
   ORDER BY campaign.id`,
);

const conversionsResult = await transport.searchStream(
  CUSTOMER_ID,
  `SELECT campaign.id, campaign.name, segments.geo_target_city,
          segments.conversion_action_name, metrics.all_conversions
   FROM geographic_view
   WHERE campaign.id IN (${idList})
     AND segments.date BETWEEN '${START_DATE}' AND '${END_DATE}'
     AND metrics.all_conversions > 0`,
);

const totals = new Map<
  string,
  { name: string; status: string; clicks: number; cost: number }
>();
for (const rowValue of totalsResult.rows) {
  const row = record(rowValue);
  const campaign = record(row['campaign']);
  const metrics = record(row['metrics']);
  const id = text(campaign['id']);
  if (!CAMPAIGN_IDS.includes(id as (typeof CAMPAIGN_IDS)[number])) continue;
  totals.set(id, {
    name: text(campaign['name']),
    status: text(campaign['status']),
    clicks: number(metrics['clicks']),
    cost: number(metrics['costMicros']) / 1e6,
  });
}

const conversionRows: Array<{
  campaignId: string;
  cityResource: string;
  conversions: number;
}> = [];
for (const rowValue of conversionsResult.rows) {
  const row = record(rowValue);
  const campaign = record(row['campaign']);
  const segments = record(row['segments']);
  const metrics = record(row['metrics']);
  if (text(segments['conversionActionName']) !== WHATSAPP_ACTION) continue;
  const campaignId = text(campaign['id']);
  const cityResource = text(segments['geoTargetCity']);
  if (!CAMPAIGN_IDS.includes(campaignId as (typeof CAMPAIGN_IDS)[number])) continue;
  if (!/^geoTargetConstants\/\d+$/.test(cityResource)) continue;
  conversionRows.push({
    campaignId,
    cityResource,
    conversions: number(metrics['allConversions']),
  });
}

const resources = [...new Set(conversionRows.map((row) => row.cityResource))];
const cityNames = new Map<string, string>();
if (resources.length > 0) {
  const resourceList = resources.map((resource) => `'${resource}'`).join(',');
  const citiesResult = await transport.searchStream(
    CUSTOMER_ID,
    `SELECT geo_target_constant.resource_name, geo_target_constant.name,
            geo_target_constant.canonical_name, geo_target_constant.country_code,
            geo_target_constant.target_type
     FROM geo_target_constant
     WHERE geo_target_constant.resource_name IN (${resourceList})`,
  );
  for (const rowValue of citiesResult.rows) {
    const geo = record(record(rowValue)['geoTargetConstant']);
    if (text(geo['targetType']) !== 'City' || text(geo['countryCode']) !== 'BR') continue;
    cityNames.set(text(geo['resourceName']), displayCity(text(geo['name'])));
  }
}

const conversionsByCampaign = new Map<string, number>();
const conversionsByCity = new Map<string, number>();
for (const row of conversionRows) {
  conversionsByCampaign.set(
    row.campaignId,
    (conversionsByCampaign.get(row.campaignId) ?? 0) + row.conversions,
  );
  const city = cityNames.get(row.cityResource) ?? 'Cidade não resolvida';
  conversionsByCity.set(city, (conversionsByCity.get(city) ?? 0) + row.conversions);
}

const allCampaigns = [...totals.values()];
const search = totals.get(SEARCH_CAMPAIGN_ID);
const current = totals.get(CURRENT_CAMPAIGN_ID);
const allCost = allCampaigns.reduce((sum, campaign) => sum + campaign.cost, 0);
const allClicks = allCampaigns.reduce((sum, campaign) => sum + campaign.clicks, 0);
const whatsappConversions = [...conversionsByCampaign.values()].reduce(
  (sum, conversions) => sum + conversions,
  0,
);
const demandGenCost = allCost - (search?.cost ?? 0);
const demandGenClicks = allClicks - (search?.clicks ?? 0);

const cities = [...conversionsByCity.entries()].sort(
  ([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB, 'pt-BR'),
);

const lines = [
  `*RELATÓRIO GOOGLE ADS — CÁSSIO FERRAZ*`,
  `Atualizado em ${OBSERVED_AT} · fonte: Google Ads API ${transport.apiVersion}`,
  '',
  `*Resultado histórico das campanhas Demand Gen*`,
  `• ${whatsappConversions} cliques no botão do WhatsApp registrados`,
  `• ${demandGenClicks.toLocaleString('pt-BR')} cliques nos anúncios`,
  `• ${brl(demandGenCost)} investidos`,
  `• ${brl(whatsappConversions > 0 ? demandGenCost / whatsappConversions : 0)} por clique no WhatsApp`,
  '',
  `*Campanha atual*`,
  `• ${conversionsByCampaign.get(CURRENT_CAMPAIGN_ID) ?? 0} cliques no WhatsApp`,
  `• ${(current?.clicks ?? 0).toLocaleString('pt-BR')} cliques nos anúncios`,
  `• ${brl(current?.cost ?? 0)} investidos`,
  `• ${brl((conversionsByCampaign.get(CURRENT_CAMPAIGN_ID) ?? 0) > 0 ? (current?.cost ?? 0) / (conversionsByCampaign.get(CURRENT_CAMPAIGN_ID) ?? 1) : 0)} por clique no WhatsApp`,
  '',
  `*Cidades dos cliques no WhatsApp*`,
  ...cities.map(([city, conversions]) => `• ${city}: ${conversions}`),
  '',
  `*Visão completa da mídia*`,
  `Incluindo a campanha piloto de Pesquisa, que gastou ${brl(search?.cost ?? 0)} e não registrou WhatsApp:`,
  `• investimento total: ${brl(allCost)}`,
  `• cliques totais nos anúncios: ${allClicks.toLocaleString('pt-BR')}`,
  `• custo total da mídia por WhatsApp: ${brl(whatsappConversions > 0 ? allCost / whatsappConversions : 0)}`,
  '',
  `_“Clique no WhatsApp” é uma microconversão medida pelo Google Ads; não comprova conversa iniciada nem contrato fechado._`,
];

process.stdout.write(`${lines.join('\n')}\n`);
