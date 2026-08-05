/**
 * Monitor da campanha do Cássio — SOMENTE LEITURA.
 *
 * Nenhum mutate. Lê métricas, compara com os limiares e imprime alerta.
 * Guarda cada leitura em `audit/google-ads-monitor.jsonl` para dar histórico.
 *
 * Limiares escolhidos a partir dos dados reais da campanha, não por convenção:
 * o melhor dia teve CPC de R$ 0,13; os dias ruins, R$ 3–4. R$ 1,00 fica no
 * meio e separa bem os dois regimes.
 */

import { readFile, appendFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const CID = '2656966896';
const CAMPAIGN = '24066140634';

const CPC_ALERT_BRL = 1.0;
const SPEND_ALERT_BRL = 400;
const BUDGET_CAP_BRL = 472.94;
const SPEND_WITHOUT_CONTACT_BRL = 100;

for (const line of (await readFile(ROOT + '.env', 'utf8')).split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && m[1] && m[2]) process.env[m[1]] = m[2];
}

const { describeCredentials } = await import(
  ROOT + 'packages/integrations/src/google-ads/credential-provider.js'
);
const { createGoogleAdsTransport } = await import(
  ROOT + 'packages/integrations/src/google-ads/transport.js'
);

const creds = await describeCredentials();
const tp = await createGoogleAdsTransport({
  keyPath: creds.credentialReference as string,
  developerToken: process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] as string,
  loginCustomerId: '3992594849',
});

const { rows } = await tp.searchStream(
  CID,
  `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions,
          metrics.conversions, metrics.all_conversions
   FROM campaign WHERE campaign.id = ${CAMPAIGN}
     AND segments.date DURING LAST_7_DAYS ORDER BY segments.date`,
);

const st = await tp.searchStream(
  CID,
  `SELECT campaign.status, campaign.primary_status, campaign.primary_status_reasons,
          campaign_budget.total_amount_micros
   FROM campaign WHERE campaign.id = ${CAMPAIGN}`,
);
const info = (st.rows[0] ?? {}) as Record<string, Record<string, unknown>>;

type Day = { date: string; cost: number; clicks: number; conv: number; all: number };
const days: Day[] = rows.map((r) => {
  const rec = r as Record<string, Record<string, unknown>>;
  const m = rec['metrics'] ?? {};
  return {
    date: String(rec['segments']?.['date'] ?? ''),
    cost: Number(m['costMicros'] ?? 0) / 1e6,
    clicks: Number(m['clicks'] ?? 0),
    conv: Number(m['conversions'] ?? 0),
    all: Number(m['allConversions'] ?? 0),
  };
});

const total = days.reduce(
  (a, d) => ({ cost: a.cost + d.cost, clicks: a.clicks + d.clicks, all: a.all + d.all }),
  { cost: 0, clicks: 0, all: 0 },
);
const last = days[days.length - 1];
const alerts: string[] = [];

if (last !== undefined && last.clicks > 0) {
  const cpc = last.cost / last.clicks;
  if (cpc > CPC_ALERT_BRL) {
    alerts.push(
      `CPC de R$ ${cpc.toFixed(2)} em ${last.date} — acima de R$ ${CPC_ALERT_BRL.toFixed(2)}. ` +
        'Está comprando clique caro; o melhor dia teve R$ 0,13.',
    );
  }
}
if (last !== undefined && last.cost > SPEND_WITHOUT_CONTACT_BRL && last.all === 0) {
  alerts.push(`R$ ${last.cost.toFixed(2)} gastos em ${last.date} sem nenhum contato novo.`);
}

const status = String(info['campaign']?.['status'] ?? '?');
const primary = String(info['campaign']?.['primaryStatus'] ?? '?');
const budget = Number(info['campaignBudget']?.['totalAmountMicros'] ?? 0) / 1e6;

console.log('=== Cássio Ferraz — campanha 24066140634 ===');
console.log(`status: ${status} / ${primary}   orçamento: R$ ${budget.toFixed(2)}`);
console.log('');
for (const d of days) {
  const cpc = d.clicks > 0 ? (d.cost / d.clicks).toFixed(2) : '—';
  console.log(
    `  ${d.date} | R$ ${d.cost.toFixed(2).padStart(7)} | ${String(d.clicks).padStart(4)} cliques ` +
      `| CPC ${String(cpc).padStart(5)} | WhatsApp ${d.all}`,
  );
}
console.log('');
console.log(`7 dias: R$ ${total.cost.toFixed(2)} | ${total.clicks} cliques | ${total.all} contatos`);
console.log(`restante até o teto: R$ ${(BUDGET_CAP_BRL - total.cost).toFixed(2)} (aprox.)`);

if (alerts.length > 0) {
  console.log('\n*** ALERTAS ***');
  for (const a of alerts) console.log('  ! ' + a);
} else {
  console.log('\nSem alertas.');
}

await mkdir(ROOT + 'audit', { recursive: true });
await appendFile(
  ROOT + 'audit/google-ads-monitor.jsonl',
  JSON.stringify({ at: new Date().toISOString(), status, primary, budget, total, days, alerts }) + '\n',
);
