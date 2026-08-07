/**
 * Governador de orçamento — impede que um cliente gaste o saldo de outro.
 *
 * ## O problema
 *
 * A conta `2656966896` é compartilhada. O Google Ads não tem carteira por
 * campanha: existe um saldo só, e quem veicula consome dele. Se o Cássio gasta
 * R$ 50/dia e a fatia dele acaba, ele continua gastando — agora o dinheiro da
 * Garbo. Nada na plataforma impede isso, e não há como fazer impedir.
 *
 * A única alavanca real é o **orçamento diário por campanha**. Este módulo
 * decide qual deve ser esse número para que a fatia de cada cliente não seja
 * ultrapassada, e produz uma recomendação para o dono aprovar.
 *
 * ## Este módulo não escreve nada
 *
 * Ele é função pura: entra estado, sai diagnóstico e recomendação. Aplicar é
 * responsabilidade de `planCampaignBudget` + `execute`, que exigem hash de
 * aprovação. Separado de propósito — o que decide o valor não é o que tem
 * permissão de gravá-lo.
 *
 * ## As duas margens que existem porque a realidade não é instantânea
 *
 * **1. O Google gasta até 2× o orçamento diário num dia.** Ele compensa ao
 * longo do mês, mas o dia isolado estoura. Logo, com R$ 10 restantes, um
 * orçamento de R$ 10/dia pode virar R$ 20 gastos. O teto seguro é
 * `restante ÷ 2`, não `restante`. Esta é a regra que a intuição erra.
 *
 * **2. O relatório atrasa.** Entre duas leituras do monitor há gasto que já
 * aconteceu e ainda não aparece. Tratar `gastoConhecido` como gasto real
 * subestima o consumo justamente no momento em que a margem é menor. Por isso
 * descontamos uma estimativa do que provavelmente já foi gasto e ainda não foi
 * visto.
 *
 * Ambas as margens erram para o lado seguro: interrompem cedo demais, nunca
 * tarde demais. Num modelo pré-pago, parar cedo custa algumas horas de
 * veiculação; parar tarde custa o dinheiro de outro cliente.
 */

/** Piso decidido pelo dono: campanha não sai do ar, cai para cá. */
export const PISO_DIARIO_BRL = 1.0;

/** O Google pode gastar até este múltiplo do orçamento diário num único dia. */
export const FATOR_ESTOURO_DIARIO = 2;

/** Abaixo disto o dono precisa ser avisado para pedir Pix ao cliente. */
export const DIAS_PARA_ALERTA = 3;

export type NivelDeRisco =
  /** Folga confortável. Nada a fazer. */
  | 'saudavel'
  /** Menos de 3 dias de saldo. Hora de pedir depósito, ainda sem urgência. */
  | 'atencao'
  /** Menos de 1 dia. O orçamento precisa cair para não ultrapassar a fatia. */
  | 'critico'
  /** Já ultrapassou. Cada centavo daqui em diante sai do bolso de outro. */
  | 'estourado';

export interface CampanhaDoCliente {
  readonly campaignId: string;
  readonly nome: string;
  readonly orcamentoDiarioBRL: number;
  readonly ativa: boolean;
}

export interface EstadoDoCliente {
  readonly clientSlug: string;
  /** Soma dos depósitos lançados em `inventory/saldo-por-cliente.yaml`. */
  readonly depositadoBRL: number;
  /** Gasto lido da API (`metrics.cost_micros`) das campanhas deste cliente. */
  readonly gastoConhecidoBRL: number;
  /** Horas desde a leitura que produziu `gastoConhecidoBRL`. */
  readonly horasDesdeLeitura: number;
  readonly campanhas: readonly CampanhaDoCliente[];
}

export interface RecomendacaoDeCampanha {
  readonly campaignId: string;
  readonly nome: string;
  readonly orcamentoAtualBRL: number;
  readonly orcamentoRecomendadoBRL: number;
  readonly motivo: string;
}

export interface DiagnosticoDoCliente {
  readonly clientSlug: string;
  readonly nivel: NivelDeRisco;
  readonly depositadoBRL: number;
  readonly gastoConhecidoBRL: number;
  /** Estimativa do que já foi gasto e ainda não apareceu no relatório. */
  readonly gastoNaoVistoBRL: number;
  /** `depositado - gastoConhecido`. O número otimista. */
  readonly restanteBrutoBRL: number;
  /** `restanteBruto - gastoNaoVisto`. O número com que se decide. */
  readonly restanteSeguroBRL: number;
  /** Quanto este cliente já consumiu da fatia alheia. Zero se não estourou. */
  readonly consumidoDeOutrosBRL: number;
  readonly orcamentoDiarioTotalBRL: number;
  readonly diasRestantes: number;
  /** Teto diário total que respeita a fatia, considerando a regra do 2×. */
  readonly tetoDiarioSeguroBRL: number;
  readonly recomendacoes: readonly RecomendacaoDeCampanha[];
  /** Frase única para o alerta. Escrita para ser lida às 3 da manhã. */
  readonly resumo: string;
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Reparte um teto total entre campanhas mantendo a proporção dos orçamentos
 * atuais.
 *
 * Proporcional, e não igual, porque a divisão atual carrega uma decisão que já
 * foi tomada — na Garbo, o rateio pelas conversas geradas por cada campanha.
 * Um corte de emergência não é hora de refazer essa decisão; é hora de
 * preservá-la em escala menor.
 *
 * Toda campanha ativa recebe ao menos o piso. Se a soma dos pisos já estourar
 * o teto, todas ficam no piso — abaixo disso só desligando, e desligar é
 * justamente o que o dono não quer.
 */
function repartirProporcional(
  campanhas: readonly CampanhaDoCliente[],
  tetoTotal: number,
): Map<string, number> {
  const ativas = campanhas.filter((c) => c.ativa);
  const resultado = new Map<string, number>();
  if (ativas.length === 0) return resultado;

  const somaAtual = ativas.reduce((s, c) => s + c.orcamentoDiarioBRL, 0);
  const pisoTotal = PISO_DIARIO_BRL * ativas.length;

  if (tetoTotal <= pisoTotal || somaAtual <= 0) {
    for (const c of ativas) resultado.set(c.campaignId, PISO_DIARIO_BRL);
    return resultado;
  }

  // Reparte o que sobra acima do piso, na proporção dos orçamentos atuais.
  const excedente = tetoTotal - pisoTotal;
  for (const c of ativas) {
    const fatia = (c.orcamentoDiarioBRL / somaAtual) * excedente;
    resultado.set(c.campaignId, arredondar(PISO_DIARIO_BRL + fatia));
  }
  return resultado;
}

/**
 * Diagnostica um cliente e recomenda os orçamentos.
 *
 * Nunca recomenda AUMENTO. Aumentar gasto é decisão que só faz sentido diante
 * de depósito novo, e é o dono quem sabe que o depósito entrou. Um governador
 * que sobe orçamento sozinho deixa de ser freio e vira acelerador.
 */
export function diagnosticar(estado: EstadoDoCliente): DiagnosticoDoCliente {
  const ativas = estado.campanhas.filter((c) => c.ativa);
  const orcamentoDiarioTotal = arredondar(
    ativas.reduce((s, c) => s + c.orcamentoDiarioBRL, 0),
  );

  // Pior caso do que já foi gasto e ainda não foi reportado: o orçamento
  // rodando no fator de estouro, pelas horas decorridas desde a leitura.
  const gastoNaoVisto = arredondar(
    orcamentoDiarioTotal * FATOR_ESTOURO_DIARIO * (Math.max(0, estado.horasDesdeLeitura) / 24),
  );

  const restanteBruto = arredondar(estado.depositadoBRL - estado.gastoConhecidoBRL);
  const restanteSeguro = arredondar(restanteBruto - gastoNaoVisto);
  const consumidoDeOutros = restanteBruto < 0 ? arredondar(-restanteBruto) : 0;

  const diasRestantes =
    orcamentoDiarioTotal > 0 ? arredondar(Math.max(0, restanteSeguro) / orcamentoDiarioTotal) : Infinity;

  // A regra do 2×: com R$ 10 restantes, R$ 10/dia pode virar R$ 20 gastos.
  const tetoDiarioSeguro = arredondar(Math.max(0, restanteSeguro) / FATOR_ESTOURO_DIARIO);

  let nivel: NivelDeRisco;
  if (restanteBruto <= 0) nivel = 'estourado';
  else if (diasRestantes < 1) nivel = 'critico';
  else if (diasRestantes < DIAS_PARA_ALERTA) nivel = 'atencao';
  else nivel = 'saudavel';

  // Em 'saudavel' e 'atencao' não se mexe em orçamento: ainda há folga, e
  // mexer em orçamento pode reiniciar fase de aprendizado. Alertar basta.
  const precisaAgir = nivel === 'critico' || nivel === 'estourado';

  let recomendacoes: RecomendacaoDeCampanha[] = [];
  if (precisaAgir && ativas.length > 0) {
    const alvo = nivel === 'estourado' ? PISO_DIARIO_BRL * ativas.length : tetoDiarioSeguro;
    const repartido = repartirProporcional(estado.campanhas, alvo);
    recomendacoes = ativas
      .map((c) => {
        const novo = repartido.get(c.campaignId) ?? PISO_DIARIO_BRL;
        return {
          campaignId: c.campaignId,
          nome: c.nome,
          orcamentoAtualBRL: c.orcamentoDiarioBRL,
          orcamentoRecomendadoBRL: novo,
          motivo:
            nivel === 'estourado'
              ? `Saldo de ${estado.clientSlug} esgotado. Piso de R$ ${PISO_DIARIO_BRL.toFixed(2)} ` +
                'mantém a campanha no ar sem consumir a fatia de outro cliente.'
              : `Restam R$ ${restanteSeguro.toFixed(2)}. Teto seguro é metade disso ` +
                `(R$ ${tetoDiarioSeguro.toFixed(2)}), porque o Google pode gastar até ` +
                `${FATOR_ESTOURO_DIARIO}× o orçamento diário num único dia.`,
        };
      })
      // Só entra na lista o que de fato muda, e só para BAIXO.
      .filter((r) => r.orcamentoRecomendadoBRL < r.orcamentoAtualBRL - 0.005);
  }

  const resumo = (() => {
    switch (nivel) {
      case 'estourado':
        return (
          `${estado.clientSlug} ESTOUROU o saldo em R$ ${consumidoDeOutros.toFixed(2)}. ` +
          'Esse valor está saindo da fatia de outro cliente. Derrubar ao piso agora.'
        );
      case 'critico':
        return (
          `${estado.clientSlug} tem menos de 1 dia de saldo ` +
          `(R$ ${restanteSeguro.toFixed(2)} contra R$ ${orcamentoDiarioTotal.toFixed(2)}/dia). ` +
          `Reduzir para R$ ${tetoDiarioSeguro.toFixed(2)}/dia ou pedir depósito hoje.`
        );
      case 'atencao':
        return (
          `${estado.clientSlug} tem ${diasRestantes.toFixed(1)} dias de saldo. ` +
          'Hora de avisar o cliente — ainda dá tempo do Pix cair antes de acabar.'
        );
      default:
        return `${estado.clientSlug} com ${diasRestantes.toFixed(1)} dias de saldo. Sem ação.`;
    }
  })();

  return {
    clientSlug: estado.clientSlug,
    nivel,
    depositadoBRL: estado.depositadoBRL,
    gastoConhecidoBRL: estado.gastoConhecidoBRL,
    gastoNaoVistoBRL: gastoNaoVisto,
    restanteBrutoBRL: restanteBruto,
    restanteSeguroBRL: restanteSeguro,
    consumidoDeOutrosBRL: consumidoDeOutros,
    orcamentoDiarioTotalBRL: orcamentoDiarioTotal,
    diasRestantes,
    tetoDiarioSeguroBRL: tetoDiarioSeguro,
    recomendacoes,
    resumo,
  };
}

export interface DiagnosticoDaConta {
  readonly fundosDisponiveisBRL: number;
  readonly somaDasFatiasBRL: number;
  /**
   * Fundos menos a soma do que os clientes ainda têm a receber em veiculação.
   * Negativo significa que a conta promete mais do que tem — alguém não vai
   * receber o que pagou.
   */
  readonly descobertoBRL: number;
  readonly clientes: readonly DiagnosticoDoCliente[];
  readonly precisaDecisao: boolean;
}

// ---------------------------------------------------------------------------
// Conciliação de caixa
// ---------------------------------------------------------------------------

/**
 * Um Pix de cliente, decomposto.
 *
 * São TRÊS números, não um, e confundi-los é o erro que inutiliza o governador:
 *
 *   recebidoDoCliente = comissao + depositadoEmAds
 *
 * O que dá pista de veiculação ao cliente é `depositadoEmAds` — só ele. Lançar
 * o valor do Pix como se fosse saldo de anúncio infla a pista calculada: o
 * governador acha que há mais dias do que há, e deixa o cliente consumir a
 * fatia de outro **enquanto reporta tudo verde**. O número inflado não engana
 * só o cliente; engana o freio.
 *
 * Comissão de gestão é legítima e normal. O que não sobrevive a uma auditoria
 * é o relatório de veiculação dizer um número que o Google não confirma.
 */
export interface EntradaDeCaixa {
  readonly clientSlug: string;
  readonly em: string;
  readonly recebidoDoClienteBRL: number;
  readonly comissaoBRL: number;
  readonly depositadoEmAdsBRL: number;
}

export interface ProblemaDeCaixa {
  readonly tipo: 'entrada_nao_fecha' | 'caixa_nao_bate' | 'comissao_negativa';
  readonly clientSlug: string | null;
  readonly diferencaBRL: number;
  readonly descricao: string;
}

export interface ConciliacaoDeCaixa {
  readonly recebidoTotalBRL: number;
  readonly comissaoTotalBRL: number;
  readonly depositadoTotalBRL: number;
  readonly gastoTotalBRL: number;
  readonly creditosPromocionaisBRL: number;
  /** O que deveria estar na conta, pela nossa contabilidade. */
  readonly saldoEsperadoBRL: number;
  /** O que o Google diz que está na conta. */
  readonly saldoRealBRL: number;
  /** `real - esperado`. Diferente de zero = dinheiro sem dono declarado. */
  readonly divergenciaBRL: number;
  readonly problemas: readonly ProblemaDeCaixa[];
  readonly bate: boolean;
}

/** Centavos de arredondamento não são divergência. R$ 1 já é. */
const TOLERANCIA_BRL = 1.0;

/**
 * Confere se a contabilidade por cliente fecha com o saldo real da conta.
 *
 * Esta é a checagem que de fato pega consumo cruzado. O governador olha cliente
 * por cliente e pode achar que está tudo bem; a conciliação olha o caixa e
 * pergunta se a soma das partes explica o todo.
 *
 * `creditosPromocionais` entra separado de propósito. Bônus do Google cai no
 * bolso comum e subsidia quem estiver veiculando — não é dinheiro de cliente
 * nenhum. Sem uma linha própria, ele apareceria como divergência inexplicável
 * todo mês, e divergência que sempre aparece é divergência que ninguém olha.
 */
export function conciliarCaixa(
  saldoRealBRL: number,
  entradas: readonly EntradaDeCaixa[],
  gastoTotalBRL: number,
  creditosPromocionaisBRL = 0,
): ConciliacaoDeCaixa {
  const problemas: ProblemaDeCaixa[] = [];

  for (const e of entradas) {
    const soma = arredondar(e.comissaoBRL + e.depositadoEmAdsBRL);
    const dif = arredondar(e.recebidoDoClienteBRL - soma);
    if (Math.abs(dif) > 0.01) {
      problemas.push({
        tipo: 'entrada_nao_fecha',
        clientSlug: e.clientSlug,
        diferencaBRL: dif,
        descricao:
          `Pix de ${e.clientSlug} em ${e.em}: recebido R$ ${e.recebidoDoClienteBRL.toFixed(2)} ` +
          `mas comissão + depósito somam R$ ${soma.toFixed(2)}. ` +
          `Faltam R$ ${dif.toFixed(2)} sem destino declarado.`,
      });
    }
    if (e.comissaoBRL < 0) {
      problemas.push({
        tipo: 'comissao_negativa',
        clientSlug: e.clientSlug,
        diferencaBRL: e.comissaoBRL,
        descricao:
          `Comissão negativa em ${e.clientSlug}: significa que foi depositado mais do que o ` +
          'cliente mandou. Não é erro de digitação por definição — pode ser dinheiro do dono ' +
          'cobrindo o cliente. Se for, declare como tal.',
      });
    }
  }

  const recebidoTotal = arredondar(entradas.reduce((s, e) => s + e.recebidoDoClienteBRL, 0));
  const comissaoTotal = arredondar(entradas.reduce((s, e) => s + e.comissaoBRL, 0));
  const depositadoTotal = arredondar(entradas.reduce((s, e) => s + e.depositadoEmAdsBRL, 0));

  const saldoEsperado = arredondar(depositadoTotal + creditosPromocionaisBRL - gastoTotalBRL);
  const divergencia = arredondar(saldoRealBRL - saldoEsperado);

  if (Math.abs(divergencia) > TOLERANCIA_BRL) {
    problemas.push({
      tipo: 'caixa_nao_bate',
      clientSlug: null,
      diferencaBRL: divergencia,
      descricao:
        divergencia > 0
          ? `Há R$ ${divergencia.toFixed(2)} na conta a mais do que a contabilidade explica. ` +
            'Provável bônus do Google não lançado, ou dinheiro do dono. Enquanto não tiver ' +
            'dono declarado, esse valor subsidia quem gastar mais rápido.'
          : `Faltam R$ ${Math.abs(divergencia).toFixed(2)} na conta. Foi gasto mais do que os ` +
            'clientes depositaram — a diferença saiu do bolso do dono ou de um depósito não lançado.',
    });
  }

  return {
    recebidoTotalBRL: recebidoTotal,
    comissaoTotalBRL: comissaoTotal,
    depositadoTotalBRL: depositadoTotal,
    gastoTotalBRL: arredondar(gastoTotalBRL),
    creditosPromocionaisBRL: arredondar(creditosPromocionaisBRL),
    saldoEsperadoBRL: saldoEsperado,
    saldoRealBRL: arredondar(saldoRealBRL),
    divergenciaBRL: divergencia,
    problemas,
    bate: problemas.length === 0,
  };
}

/**
 * Junta os clientes e checa a conta inteira.
 *
 * A checagem de conta existe porque a soma das fatias pode passar dos fundos
 * reais sem que nenhum cliente esteja individualmente estourado — basta o dono
 * ter prometido mais do que depositou. É um erro que só aparece olhando o
 * agregado.
 */
export function diagnosticarConta(
  fundosDisponiveisBRL: number,
  estados: readonly EstadoDoCliente[],
): DiagnosticoDaConta {
  const clientes = estados.map(diagnosticar);
  const somaDasFatias = arredondar(
    clientes.reduce((s, c) => s + Math.max(0, c.restanteBrutoBRL), 0),
  );
  return {
    fundosDisponiveisBRL: arredondar(fundosDisponiveisBRL),
    somaDasFatiasBRL: somaDasFatias,
    descobertoBRL: arredondar(fundosDisponiveisBRL - somaDasFatias),
    clientes,
    precisaDecisao: clientes.some((c) => c.recomendacoes.length > 0),
  };
}
