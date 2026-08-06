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

/**
 * Carrega o `.env` quando ele existe.
 *
 * Ausência não é erro: rodando em CI as credenciais vêm do ambiente (Actions
 * secrets), e não há nem deve haver `.env` no runner. O que fica valendo em
 * ambos os casos é a checagem logo abaixo — falta de credencial é erro, falta
 * de arquivo não.
 *
 * Variável já presente no ambiente tem precedência sobre o arquivo: em CI o
 * segredo injetado é a fonte da verdade.
 */
try {
  for (const line of (await readFile(ROOT + '.env', 'utf8')).split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && m[1] && m[2] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // sem .env — segue com o que estiver no ambiente
}

if (!process.env['GOOGLE_ADS_DEVELOPER_TOKEN']) {
  console.error(
    'GOOGLE_ADS_DEVELOPER_TOKEN ausente. Defina no .env (local) ou nos secrets (CI).',
  );
  process.exit(1);
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
          campaign.start_date, campaign.end_date,
          campaign_budget.total_amount_micros
   FROM campaign WHERE campaign.id = ${CAMPAIGN}`,
);
const info = (st.rows[0] ?? {}) as Record<string, Record<string, unknown>>;

/**
 * Gasto do PERÍODO INTEIRO da campanha, não dos últimos 7 dias.
 *
 * Bug corrigido em 06/08: o alerta de estouro de verba e o "restante até o
 * teto" usavam o total da janela de 7 dias contra um teto que é vitalício.
 * Na primeira execução real isso imprimiu "restante R$ 443,38" quando o gasto
 * acumulado já era R$ 177,47 e o restante verdadeiro, ~R$ 295. Pior: o alerta
 * de R$ 400 comparava uma janela curta com um teto longo, então **nunca
 * dispararia** — o monitor vigiava sem que o alarme de verba pudesse tocar.
 *
 * O `campaign.start_date` só existe até a v22 da API. É mais um motivo para a
 * versão estar fixada; ver secao 5.1 do HANDOFF.
 */
const startDate = String(info['campaign']?.['startDate'] ?? '');
const today = new Date().toISOString().slice(0, 10);

let lifetimeCost = 0;
let lifetimeClicks = 0;
let lifetimeAll = 0;
let lifetimeKnown = false;

if (startDate !== '') {
  const lt = await tp.searchStream(
    CID,
    `SELECT metrics.cost_micros, metrics.clicks, metrics.all_conversions
     FROM campaign WHERE campaign.id = ${CAMPAIGN}
       AND segments.date BETWEEN '${startDate}' AND '${today}'`,
  );
  for (const r of lt.rows) {
    const m = (r as Record<string, Record<string, unknown>>)['metrics'] ?? {};
    lifetimeCost += Number(m['costMicros'] ?? 0) / 1e6;
    lifetimeClicks += Number(m['clicks'] ?? 0);
    lifetimeAll += Number(m['allConversions'] ?? 0);
  }
  lifetimeKnown = true;
}

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
if (lifetimeKnown && lifetimeCost > SPEND_ALERT_BRL) {
  alerts.push(
    `Gasto acumulado de R$ ${lifetimeCost.toFixed(2)} passou o alerta de ` +
      `R$ ${SPEND_ALERT_BRL.toFixed(2)}. Restam R$ ${(BUDGET_CAP_BRL - lifetimeCost).toFixed(2)} ` +
      'até o teto, onde a campanha para sozinha.',
  );
}
if (!lifetimeKnown) {
  alerts.push(
    'campaign.start_date veio vazio — o gasto acumulado nao pode ser apurado e o ' +
      'alerta de teto de verba esta CEGO nesta execucao. Verificar a versao da API.',
  );
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
console.log(`7 dias:     R$ ${total.cost.toFixed(2)} | ${total.clicks} cliques | ${total.all} contatos`);
if (lifetimeKnown) {
  console.log(
    `acumulado:  R$ ${lifetimeCost.toFixed(2)} | ${lifetimeClicks} cliques | ${lifetimeAll} contatos ` +
      `(desde ${startDate})`,
  );
  console.log(`restante até o teto: R$ ${(BUDGET_CAP_BRL - lifetimeCost).toFixed(2)} (aprox.)`);
} else {
  console.log('acumulado:  INDISPONÍVEL — campaign.start_date vazio');
  console.log('restante até o teto: NÃO APURADO');
}

if (alerts.length > 0) {
  console.log('\n*** ALERTAS ***');
  for (const a of alerts) console.log('  ! ' + a);
} else {
  console.log('\nSem alertas.');
}

await mkdir(ROOT + 'audit', { recursive: true });
await appendFile(
  ROOT + 'audit/google-ads-monitor.jsonl',
  JSON.stringify({
    at: new Date().toISOString(),
    status,
    primary,
    budget,
    window7d: total,
    lifetime: lifetimeKnown
      ? { since: startDate, cost: lifetimeCost, clicks: lifetimeClicks, all: lifetimeAll }
      : null,
    days,
    alerts,
  }) + '\n',
);
