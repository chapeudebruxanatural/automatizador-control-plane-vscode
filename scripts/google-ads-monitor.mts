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

/**
 * Campanha vigiada. Trocada em 06/08 da 24066140634 (pausada) para a
 * 24106867845.
 *
 * Aceita sobrescrita por variável de ambiente para que trocar de campanha não
 * exija editar, commitar e mesclar código — foi essa fricção que deixou o
 * monitor apontando para uma campanha pausada por horas.
 */
const CAMPAIGN = process.env['GOOGLE_ADS_CAMPAIGN_ID'] ?? '24106867845';

const CPC_ALERT_BRL = 1.0;
const SPEND_WITHOUT_CONTACT_BRL = 100;

/**
 * Alerta de gasto acumulado.
 *
 * A campanha antiga tinha orçamento CUSTOM_PERIOD com teto de R$ 472,94, e o
 * alerta comparava o acumulado contra esse teto. A nova tem orçamento DIÁRIO e
 * **não tem teto** — o cliente recarrega saldo quando quer. Comparar acumulado
 * contra teto deixou de fazer sentido: o número só cresce e um dia dispararia
 * sozinho, sem significar nada.
 *
 * O que importa agora é o gasto do DIA contra o orçamento diário. Gastar muito
 * acima do configurado é sinal de problema; o Google permite até 2x num dia
 * isolado, então o alerta fica acima disso.
 */
const DAILY_BUDGET_BRL = Number(process.env['GOOGLE_ADS_DAILY_BUDGET_BRL'] ?? 50);
const DAILY_OVERSPEND_FACTOR = 2.5;

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
  `SELECT campaign.name, campaign.status, campaign.primary_status,
          campaign.primary_status_reasons, campaign.start_date, campaign.end_date,
          campaign_budget.total_amount_micros, campaign_budget.amount_micros,
          campaign_budget.period
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
if (last !== undefined && last.cost > DAILY_BUDGET_BRL * DAILY_OVERSPEND_FACTOR) {
  alerts.push(
    `R$ ${last.cost.toFixed(2)} gastos em ${last.date}, mais de ${DAILY_OVERSPEND_FACTOR}x ` +
      `o orçamento diário de R$ ${DAILY_BUDGET_BRL.toFixed(2)}. O Google permite até 2x ` +
      'num dia isolado; acima disso, conferir se o orçamento foi alterado.',
  );
}
if (!lifetimeKnown) {
  alerts.push(
    'campaign.start_date veio vazio — o acumulado nao pode ser apurado. Verificar a ' +
      'versao da API (os campos de data existem ate a v22).',
  );
}

/**
 * Campanha pausada ou sem entrega é alerta.
 *
 * Em 06/08 o monitor ficou apontando para uma campanha recém-pausada e teria
 * reportado "sem alertas" com entrega zero — silêncio que parece saúde. Estado
 * que impede veiculação precisa gritar.
 */
if (/PAUSED|REMOVED/i.test(String(info['campaign']?.['status'] ?? ''))) {
  alerts.push(
    `A campanha ${CAMPAIGN} esta ${String(info['campaign']?.['status'])} — nao esta ` +
      'veiculando. Se isso for intencional, aponte o monitor para outra campanha com ' +
      'GOOGLE_ADS_CAMPAIGN_ID.',
  );
}
if (last !== undefined && last.clicks === 0 && last.cost === 0) {
  alerts.push(
    `Nenhum clique e nenhum gasto em ${last.date}. Campanha pode estar pausada, em ` +
      'revisao ou sem anuncio aprovado.',
  );
}

const status = String(info['campaign']?.['status'] ?? '?');
const primary = String(info['campaign']?.['primaryStatus'] ?? '?');
const budget = Number(info['campaignBudget']?.['totalAmountMicros'] ?? 0) / 1e6;

const campaignName = String(info['campaign']?.['name'] ?? `campanha ${CAMPAIGN}`);
const dailyMicros = Number(info['campaignBudget']?.['amountMicros'] ?? 0) / 1e6;
const budgetLabel =
  dailyMicros > 0 ? `R$ ${dailyMicros.toFixed(2)}/dia` : `R$ ${budget.toFixed(2)} (total)`;

console.log(`=== Cássio Ferraz — ${campaignName} (${CAMPAIGN}) ===`);
console.log(`status: ${status} / ${primary}   orçamento: ${budgetLabel}`);
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
  const cpcMedio = lifetimeClicks > 0 ? lifetimeCost / lifetimeClicks : 0;
  const taxa = lifetimeClicks > 0 ? (lifetimeAll / lifetimeClicks) * 100 : 0;
  console.log(
    `CPC médio:  R$ ${cpcMedio.toFixed(2)}   taxa de contato: ${taxa.toFixed(2)}% ` +
      `(${lifetimeAll} em ${lifetimeClicks} cliques)`,
  );
} else {
  console.log('acumulado:  INDISPONÍVEL — campaign.start_date vazio');
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
