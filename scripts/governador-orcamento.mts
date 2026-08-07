/**
 * Governador de orçamento — SOMENTE LEITURA. Propõe, não aplica.
 *
 * Lê o gasto real de cada cliente na API, cruza com os depósitos declarados em
 * `inventory/saldo-por-cliente.yaml`, e imprime o diagnóstico junto com a
 * recomendação de orçamento.
 *
 * **Este script não escreve nada em lugar nenhum.** Ele termina imprimindo o
 * comando de aplicação, que passa pelo fluxo de plano-e-hash do
 * `write-adapter` e exige aprovação explícita. É de propósito: o que decide o
 * número não é o que tem permissão de gravá-lo.
 *
 * Código de saída:
 *   0 — nada a decidir
 *   3 — há recomendação aguardando decisão do dono
 *   1 — erro de execução
 *
 * O 3 existe para o agendador conseguir distinguir "rodou e está tudo bem" de
 * "rodou e precisa de você". Um script que sai 0 nos dois casos vira ruído.
 */

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

const ROOT = new URL('..', import.meta.url).pathname;
const CID = '2656966896';

try {
  for (const line of (await readFile(ROOT + '.env', 'utf8')).split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && m[1] && m[2] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // sem .env — em CI as credenciais vêm do ambiente
}

if (!process.env['GOOGLE_ADS_DEVELOPER_TOKEN']) {
  console.error('GOOGLE_ADS_DEVELOPER_TOKEN ausente. Defina no .env (local) ou nos secrets (CI).');
  process.exit(1);
}

const { describeCredentials } = await import(
  ROOT + 'packages/integrations/src/google-ads/credential-provider.js'
);
const { createGoogleAdsTransport } = await import(
  ROOT + 'packages/integrations/src/google-ads/transport.js'
);
const { diagnosticarConta } = await import(
  ROOT + 'packages/integrations/src/google-ads/budget-governor.js'
);
const { AUTHORIZED_CAMPAIGNS } = await import(
  ROOT + 'packages/integrations/src/google-ads/scope.js'
);

interface LedgerCampanha {
  id: string;
  orcamentoDiario: number;
}
interface LedgerDeposito {
  em: string;
  recebidoDoCliente?: number;
  comissao?: number | null;
  /** O único que dá pista de veiculação. Ver o cabeçalho do YAML. */
  depositadoEmAds?: number;
}
interface LedgerCliente {
  slug: string;
  depositos?: LedgerDeposito[];
  campanhasAtivas?: LedgerCampanha[];
}
interface Ledger {
  conta: { fundosDisponiveis: { valor: number } };
  rateioDeclarado?: { em: string; porCliente: Record<string, number> };
  clientes: LedgerCliente[];
}

const ledger = parseYaml(
  await readFile(ROOT + 'inventory/saldo-por-cliente.yaml', 'utf8'),
) as Ledger;

const creds = await describeCredentials();
const tp = await createGoogleAdsTransport({
  keyPath: creds.credentialReference as string,
  developerToken: process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] as string,
  loginCustomerId: '3992594849',
});

const hoje = new Date().toISOString().slice(0, 10);
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

/**
 * Gasto de uma campanha a partir de uma data.
 *
 * A data de corte é a do PRIMEIRO depósito do ciclo, não o início da campanha.
 * Medir desde o início misturaria o dinheiro deste ciclo com o de ciclos
 * anteriores e faria todo cliente antigo parecer estourado.
 */
async function gastoDesde(campaignId: string, desde: string): Promise<number> {
  const { rows } = await tp.searchStream(
    CID,
    `SELECT metrics.cost_micros FROM campaign
     WHERE campaign.id = ${campaignId}
       AND segments.date BETWEEN '${desde}' AND '${hoje}'`,
  );
  let total = 0;
  for (const r of rows) {
    const m = (r as Record<string, Record<string, unknown>>)['metrics'] ?? {};
    total += Number(m['costMicros'] ?? 0) / 1e6;
  }
  return total;
}

const rateio = ledger.rateioDeclarado;

/**
 * Estado REAL da campanha na conta: status e orçamento gravado.
 *
 * Sem esta leitura o governador só conhece a intenção declarada no livro-caixa,
 * e foi assim que o incidente de 07/08 passou despercebido — três campanhas
 * pausadas por autor desconhecido, com o painel reportando "saudável, 6,1 dias".
 * Saldo intacto e campanha parada produzem exatamente o mesmo número.
 */
async function estadoNaConta(
  campaignId: string,
): Promise<{ status: string; orcamentoBRL: number | undefined }> {
  const { rows } = await tp.searchStream(
    CID,
    `SELECT campaign.status, campaign_budget.amount_micros, campaign_budget.period
     FROM campaign WHERE campaign.id = ${campaignId}`,
  );
  const r = (rows[0] ?? {}) as Record<string, Record<string, unknown>>;
  const status = String(r['campaign']?.['status'] ?? 'UNKNOWN');
  const micros = r['campaignBudget']?.['amountMicros'];
  return {
    status,
    // CUSTOM_PERIOD não tem orçamento diário; comparar seria comparar coisas
    // diferentes e produziria divergência falsa todo dia.
    orcamentoBRL:
      String(r['campaignBudget']?.['period'] ?? '') === 'CUSTOM_PERIOD' || micros === undefined
        ? undefined
        : Number(micros) / 1e6,
  };
}

const estados = [];
const semFatia: string[] = [];
const comissaoAusente: string[] = [];
for (const c of ledger.clientes ?? []) {
  const depositos = c.depositos ?? [];
  const ativas = c.campanhasAtivas ?? [];
  if (ativas.length === 0) continue;

  /**
   * Fatia do cliente: depósitos lançados, ou o rateio declarado pelo dono.
   *
   * O fallback existe porque a primeira versão deste script pulava todo cliente
   * sem depósito — e o Cássio, que tem fatia de R$ 285,44 vinda do caixa que já
   * estava na conta, caía exatamente aí. O cliente que gasta mais rápido era o
   * único fora do governo. Cliente com campanha ativa e sem fatia declarada em
   * lugar nenhum não é "seguro": é invisível, e vai para o aviso no fim.
   */
  const depositado =
    depositos.length > 0
      ? depositos.reduce((s, d) => s + Number(d.depositadoEmAds ?? 0), 0)
      : Number(rateio?.porCliente?.[c.slug] ?? 0);

  // Comissão não declarada significa que `depositadoEmAds` provavelmente está
  // com o valor do Pix inteiro — pista inflada, freio cego. Avisar é obrigação:
  // o resto do relatório deste cliente sai de um número que ninguém confirmou.
  for (const d of depositos) {
    if (d.comissao === null || d.comissao === undefined) {
      comissaoAusente.push(`${c.slug} (${d.em})`);
    }
  }

  if (depositado <= 0) {
    semFatia.push(c.slug);
    continue;
  }

  const desde =
    depositos.length > 0
      ? (depositos.map((d) => String(d.em)).sort()[0] as string)
      : String(rateio?.em ?? hoje);

  let gasto = 0;
  const campanhas = [];
  for (const camp of ativas) {
    gasto += await gastoDesde(camp.id, desde);
    const meta = AUTHORIZED_CAMPAIGNS.find(
      (a: { campaignId: string | null }) => a.campaignId === camp.id,
    );
    const real = await estadoNaConta(camp.id);
    campanhas.push({
      campaignId: camp.id,
      nome: meta?.expectedName ?? camp.id,
      orcamentoDiarioBRL: Number(camp.orcamentoDiario),
      ativa: true,
      statusNaConta: real.status as 'ENABLED' | 'PAUSED' | 'REMOVED' | 'UNKNOWN',
      orcamentoNaContaBRL: real.orcamentoBRL,
    });
  }

  estados.push({
    clientSlug: c.slug,
    depositadoBRL: depositado,
    gastoConhecidoBRL: gasto,
    // O relatório do Google não é em tempo real. 12h é o intervalo entre duas
    // execuções agendadas — é a janela de gasto que pode existir e não estar
    // visível nesta leitura.
    horasDesdeLeitura: 12,
    campanhas,
  });
}

const conta = diagnosticarConta(ledger.conta.fundosDisponiveis.valor, estados);

console.log(`=== Governador de orçamento — ${hoje} ===\n`);
console.log(`fundos na conta:    ${brl(conta.fundosDisponiveisBRL)}`);
console.log(`prometido a clientes: ${brl(conta.somaDasFatiasBRL)}`);
if (conta.descobertoBRL < 0) {
  console.log(
    `\n*** DESCOBERTO de ${brl(-conta.descobertoBRL)}: a conta promete mais do que tem. ***`,
  );
  console.log('    Nenhum cliente está estourado sozinho — o furo só aparece no agregado.');
}

for (const c of conta.clientes) {
  const marca = { saudavel: ' ', atencao: '!', critico: '!!', estourado: '***' }[c.nivel];
  console.log(`\n${marca} ${c.clientSlug.toUpperCase()} [${c.nivel}]`);
  console.log(
    `   depositado ${brl(c.depositadoBRL)} · gasto ${brl(c.gastoConhecidoBRL)} · ` +
      `nao visto ~${brl(c.gastoNaoVistoBRL)}`,
  );
  console.log(
    `   restante seguro ${brl(c.restanteSeguroBRL)} · ${c.orcamentoDiarioTotalBRL.toFixed(2)}/dia · ` +
      `${c.diasRestantes === Infinity ? '—' : c.diasRestantes.toFixed(1)} dias`,
  );
  console.log(`   ${c.resumo}`);

  // Divergência vem antes da recomendação de orçamento: não adianta ajustar a
  // verba de uma campanha que não está no ar.
  for (const v of c.divergencias) {
    console.log(`   >>> DIVERGENCIA [${v.tipo}] ${v.nome}`);
    console.log(`       esperado ${v.esperado} · encontrado ${v.encontrado}`);
    console.log(`       ${v.descricao}`);
  }

  for (const r of c.recomendacoes) {
    console.log(
      `   -> ${r.nome}: ${brl(r.orcamentoAtualBRL)}/dia para ${brl(r.orcamentoRecomendadoBRL)}/dia`,
    );
  }
}

if (comissaoAusente.length > 0) {
  console.log(`\n! COMISSAO NAO DECLARADA: ${comissaoAusente.join(', ')}`);
  console.log('  O saldo de anuncio desses depositos esta assumindo o Pix inteiro. Se houve');
  console.log('  comissao retida, a pista real e MENOR do que a calculada acima — e a');
  console.log('  diferenca sai do saldo de outro cliente com este painel todo verde.');
  console.log('  Preencha `comissao` e `depositadoEmAds` em inventory/saldo-por-cliente.yaml.');
}

if (semFatia.length > 0) {
  console.log(
    `\n! SEM GOVERNO: ${semFatia.join(', ')} — campanha ativa, gastando, e sem fatia`,
  );
  console.log('  declarada nem em depositos nem em rateioDeclarado. Consome do bolso comum');
  console.log('  sem teto nenhum. Lance a fatia em inventory/saldo-por-cliente.yaml.');
}

if (!conta.precisaDecisao) {
  console.log('\nSem recomendação. Nada a decidir.');
  process.exit(semFatia.length > 0 || comissaoAusente.length > 0 ? 3 : 0);
}

const todasDivergencias = conta.clientes.flatMap((c) => c.divergencias);
console.log('\n--- DECISÃO NECESSÁRIA ---');
if (todasDivergencias.length > 0) {
  console.log(
    `${todasDivergencias.length} divergencia(s) entre o livro-caixa e a conta. ` +
      'Resolver ANTES de mexer em orcamento:',
  );
  for (const v of todasDivergencias) {
    console.log(`  - ${v.nome} (${v.campaignId}): ${v.esperado} -> ${v.encontrado}`);
  }
  console.log('');
}
console.log('Nenhuma destas mudanças foi aplicada. Para aplicar, cada uma passa por');
console.log('planCampaignBudget (validateOnly) e exige o hash de volta:\n');
for (const c of conta.clientes) {
  for (const r of c.recomendacoes) {
    console.log(
      `  npm run orcamento -- --cliente ${c.clientSlug} --campanha ${r.campaignId} ` +
        `--diario ${r.orcamentoRecomendadoBRL.toFixed(2)}`,
    );
  }
}
process.exit(3);
