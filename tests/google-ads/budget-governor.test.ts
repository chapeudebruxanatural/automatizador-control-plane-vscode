import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  conciliarCaixa,
  diagnosticar,
  diagnosticarConta,
  PISO_DIARIO_BRL,
  FATOR_ESTOURO_DIARIO,
  type EntradaDeCaixa,
  type EstadoDoCliente,
} from '../../packages/integrations/src/google-ads/budget-governor.js';

/** Garbo real de 07/08: três campanhas, R$ 14/dia no total. */
const garbo = (over: Partial<EstadoDoCliente> = {}): EstadoDoCliente => ({
  clientSlug: 'garbo-eventos',
  depositadoBRL: 100,
  gastoConhecidoBRL: 0,
  horasDesdeLeitura: 0,
  campanhas: [
    { campaignId: '24016194642', nome: 'MOVEIS', orcamentoDiarioBRL: 6, ativa: true },
    { campaignId: '24016194645', nome: 'MESAS', orcamentoDiarioBRL: 5, ativa: true },
    { campaignId: '24016194648', nome: 'PRODUTOS', orcamentoDiarioBRL: 3, ativa: true },
    { campaignId: '24016194654', nome: 'CASAMENTOS', orcamentoDiarioBRL: 12, ativa: false },
  ],
  ...over,
});

describe('governador de orçamento — níveis de risco', () => {
  it('cliente recém-abastecido nao dispara nada', () => {
    const d = diagnosticar(garbo());
    assert.equal(d.nivel, 'saudavel');
    assert.equal(d.orcamentoDiarioTotalBRL, 14, 'campanha pausada nao entra no total');
    assert.equal(d.diasRestantes, 7.14, '100 / 14, arredondado a centavo');
    assert.equal(d.recomendacoes.length, 0, 'nao se mexe em orcamento com folga');
  });

  it('menos de 3 dias vira aviso, mas ainda NAO mexe no orcamento', () => {
    const d = diagnosticar(garbo({ gastoConhecidoBRL: 70 })); // restam 30 = 2,1 dias
    assert.equal(d.nivel, 'atencao');
    assert.equal(
      d.recomendacoes.length,
      0,
      'mexer em orcamento pode reiniciar aprendizado; com folga, alertar basta',
    );
    assert.match(d.resumo, /avisar o cliente/);
  });

  it('menos de 1 dia recomenda corte', () => {
    const d = diagnosticar(garbo({ gastoConhecidoBRL: 90 })); // restam 10 = 0,71 dia
    assert.equal(d.nivel, 'critico');
    assert.ok(d.recomendacoes.length > 0);
  });

  it('gasto acima do depositado é estouro, e quantifica o que saiu de outro', () => {
    const d = diagnosticar(garbo({ gastoConhecidoBRL: 118.4 }));
    assert.equal(d.nivel, 'estourado');
    assert.equal(d.consumidoDeOutrosBRL, 18.4);
    assert.match(d.resumo, /fatia de outro cliente/);
  });
});

describe('governador de orçamento — a regra do 2x', () => {
  it('o teto seguro é METADE do restante, nao o restante', () => {
    // Este é o erro que a intuicao comete. Com R$ 10 restantes, um orcamento de
    // R$ 10/dia pode virar R$ 20 gastos no dia, porque o Google gasta ate 2x o
    // diario e compensa depois — mas o saldo do cliente ja foi.
    const d = diagnosticar(garbo({ gastoConhecidoBRL: 90 }));
    assert.equal(d.restanteSeguroBRL, 10);
    assert.equal(d.tetoDiarioSeguroBRL, 5);
    assert.equal(d.tetoDiarioSeguroBRL, d.restanteSeguroBRL / FATOR_ESTOURO_DIARIO);
  });

  it('a soma dos orcamentos recomendados respeita o teto seguro', () => {
    const d = diagnosticar(garbo({ gastoConhecidoBRL: 90 }));
    const soma = d.recomendacoes.reduce((s, r) => s + r.orcamentoRecomendadoBRL, 0);
    assert.ok(
      soma <= d.tetoDiarioSeguroBRL + 0.01,
      `soma recomendada ${soma} passou do teto ${d.tetoDiarioSeguroBRL}`,
    );
  });
});

describe('governador de orçamento — atraso de relatório', () => {
  it('desconta o gasto que ja aconteceu e ainda nao apareceu', () => {
    const semAtraso = diagnosticar(garbo({ gastoConhecidoBRL: 50, horasDesdeLeitura: 0 }));
    const comAtraso = diagnosticar(garbo({ gastoConhecidoBRL: 50, horasDesdeLeitura: 12 }));

    assert.equal(semAtraso.gastoNaoVistoBRL, 0);
    // 12h de R$ 14/dia rodando no fator 2 = R$ 14 possivelmente ja gastos.
    assert.equal(comAtraso.gastoNaoVistoBRL, 14);
    assert.ok(
      comAtraso.restanteSeguroBRL < semAtraso.restanteSeguroBRL,
      'atraso tem que estreitar a margem, nunca alargar',
    );
  });

  it('o atraso pode sozinho levar de atencao para critico', () => {
    // Regressao: tratar gastoConhecido como gasto real subestima o consumo
    // justamente quando a margem é menor.
    //
    // Gasto de R$ 80 com R$ 14/dia: pelo relatorio restam R$ 20, ou 1,43 dia —
    // parece confortavel. Mas 12h sem leitura podem ter consumido ate R$ 14
    // desses R$ 20, sobrando R$ 6, ou 0,43 dia. O cliente ja esta em risco e o
    // relatorio ainda nao sabe.
    const leitura = { gastoConhecidoBRL: 80, horasDesdeLeitura: 0 };
    assert.equal(diagnosticar(garbo(leitura)).nivel, 'atencao');
    assert.equal(diagnosticar(garbo({ ...leitura, horasDesdeLeitura: 12 })).nivel, 'critico');
  });
});

describe('governador de orçamento — o que ele NAO faz', () => {
  it('nunca recomenda aumento de orcamento', () => {
    // Um governador que sobe orcamento sozinho deixa de ser freio.
    for (const gasto of [0, 25, 50, 75, 95, 130]) {
      for (const horas of [0, 6, 12, 24]) {
        const d = diagnosticar(garbo({ gastoConhecidoBRL: gasto, horasDesdeLeitura: horas }));
        for (const r of d.recomendacoes) {
          assert.ok(
            r.orcamentoRecomendadoBRL < r.orcamentoAtualBRL,
            `gasto=${gasto} horas=${horas}: recomendou subir ${r.nome}`,
          );
        }
      }
    }
  });

  it('nunca recomenda zero — o piso mantem a campanha no ar', () => {
    const d = diagnosticar(garbo({ gastoConhecidoBRL: 200 }));
    assert.equal(d.nivel, 'estourado');
    for (const r of d.recomendacoes) {
      assert.ok(r.orcamentoRecomendadoBRL >= PISO_DIARIO_BRL, `${r.nome} caiu abaixo do piso`);
    }
  });

  it('nao toca em campanha pausada', () => {
    const d = diagnosticar(garbo({ gastoConhecidoBRL: 200 }));
    assert.ok(
      !d.recomendacoes.some((r) => r.campaignId === '24016194654'),
      'CASAMENTOS esta pausada e nao deveria aparecer',
    );
  });

  it('cliente sem campanha ativa nao gera recomendacao nem divisao por zero', () => {
    const d = diagnosticar({
      clientSlug: 'gaveta-producoes',
      depositadoBRL: 300,
      gastoConhecidoBRL: 0,
      horasDesdeLeitura: 12,
      campanhas: [{ campaignId: '24105770570', nome: 'Buteco', orcamentoDiarioBRL: 0, ativa: false }],
    });
    assert.equal(d.orcamentoDiarioTotalBRL, 0);
    assert.equal(d.diasRestantes, Infinity);
    assert.equal(d.recomendacoes.length, 0);
  });
});

describe('governador de orçamento — a conta inteira', () => {
  it('acusa quando o dono prometeu mais do que tem em caixa', () => {
    // Nenhum cliente estourado individualmente, e ainda assim a conta nao fecha.
    // So aparece olhando o agregado.
    const conta = diagnosticarConta(400, [
      garbo(),
      {
        clientSlug: 'cassio-ferraz',
        depositadoBRL: 285.44,
        gastoConhecidoBRL: 0,
        horasDesdeLeitura: 0,
        campanhas: [{ campaignId: '24106867845', nome: 'DIARIO', orcamentoDiarioBRL: 50, ativa: true }],
      },
      {
        clientSlug: 'gaveta-producoes',
        depositadoBRL: 300,
        gastoConhecidoBRL: 0,
        horasDesdeLeitura: 0,
        campanhas: [],
      },
    ]);
    assert.equal(conta.somaDasFatiasBRL, 685.44);
    assert.ok(conta.descobertoBRL < 0, 'promete R$ 685,44 com R$ 400 em caixa');
    assert.equal(conta.clientes.every((c) => c.nivel === 'saudavel'), true);
  });

  it('estouro nao entra como fatia positiva no agregado', () => {
    const conta = diagnosticarConta(100, [garbo({ gastoConhecidoBRL: 150 })]);
    assert.equal(conta.somaDasFatiasBRL, 0, 'saldo negativo nao vira credito');
    assert.equal(conta.precisaDecisao, true);
  });
});

describe('conciliação de caixa — comissão retida do Pix', () => {
  /** Andréia manda R$ 100, o dono retém R$ 30 de gestão, R$ 70 vao para o Google. */
  const pixGarbo: EntradaDeCaixa = {
    clientSlug: 'garbo-eventos',
    em: '2026-08-07',
    recebidoDoClienteBRL: 100,
    comissaoBRL: 30,
    depositadoEmAdsBRL: 70,
  };

  it('entrada que fecha nao gera problema', () => {
    const c = conciliarCaixa(70, [pixGarbo], 0);
    assert.equal(c.bate, true);
    assert.equal(c.recebidoTotalBRL, 100);
    assert.equal(c.comissaoTotalBRL, 30);
    assert.equal(c.depositadoTotalBRL, 70);
  });

  it('o que da pista ao cliente é o DEPOSITADO, nao o recebido', () => {
    // O erro que inutiliza o governador: lancar o Pix inteiro como saldo de
    // anuncio. A R$ 14/dia, R$ 100 parecem 7 dias; R$ 70 sao 5. Os 2 dias de
    // diferenca sairiam do saldo de outro cliente, com o painel todo verde.
    const comInflado = diagnosticar(garbo({ depositadoBRL: 100 }));
    const comReal = diagnosticar(garbo({ depositadoBRL: pixGarbo.depositadoEmAdsBRL }));
    assert.equal(comInflado.diasRestantes, 7.14);
    assert.equal(comReal.diasRestantes, 5);
    assert.ok(comInflado.diasRestantes > comReal.diasRestantes);
  });

  it('acusa Pix cujo destino nao fecha', () => {
    const c = conciliarCaixa(70, [{ ...pixGarbo, comissaoBRL: 20 }], 0);
    assert.equal(c.bate, false);
    const p = c.problemas.find((x) => x.tipo === 'entrada_nao_fecha');
    assert.ok(p, 'deveria acusar R$ 10 sem destino');
    assert.equal(p?.diferencaBRL, 10);
  });

  it('acusa caixa com dinheiro sem dono declarado', () => {
    // Depositado 70, gasto 20 -> esperado 50. Se ha 120 na conta, sobram 70
    // que nao pertencem a cliente nenhum — bonus do Google nao lancado, ou
    // dinheiro do dono. Enquanto nao tiver dono, subsidia quem gastar primeiro.
    const c = conciliarCaixa(120, [pixGarbo], 20);
    assert.equal(c.saldoEsperadoBRL, 50);
    assert.equal(c.divergenciaBRL, 70);
    assert.match(c.problemas[0]?.descricao ?? '', /subsidia quem gastar/);
  });

  it('bonus do Google lancado deixa de ser divergencia', () => {
    const c = conciliarCaixa(120, [pixGarbo], 20, 70);
    assert.equal(c.creditosPromocionaisBRL, 70);
    assert.equal(c.divergenciaBRL, 0);
    assert.equal(c.bate, true);
  });

  it('acusa gasto acima do que os clientes depositaram', () => {
    const c = conciliarCaixa(0, [pixGarbo], 95);
    assert.ok(c.divergenciaBRL > 0 || c.problemas.length > 0);
    const p = c.problemas.find((x) => x.tipo === 'caixa_nao_bate');
    assert.ok(p);
  });

  it('centavo de arredondamento nao vira alarme', () => {
    const c = conciliarCaixa(70.4, [pixGarbo], 0);
    assert.equal(c.bate, true, 'R$ 0,40 esta dentro da tolerancia');
  });

  it('comissao negativa é sinalizada, nao aceita em silencio', () => {
    const c = conciliarCaixa(150, [{ ...pixGarbo, comissaoBRL: -50, depositadoEmAdsBRL: 150 }], 0);
    assert.ok(c.problemas.some((p) => p.tipo === 'comissao_negativa'));
  });
});

describe('divergência entre o livro-caixa e a conta', () => {
  /** O incidente de 07/08: declarada ativa, PAUSED na conta. */
  const garboPausadaEscondido = () =>
    garbo({
      campanhas: [
        { campaignId: '24016194642', nome: 'MOVEIS', orcamentoDiarioBRL: 6, ativa: true, statusNaConta: 'PAUSED' as const },
        { campaignId: '24016194645', nome: 'MESAS', orcamentoDiarioBRL: 5, ativa: true, statusNaConta: 'PAUSED' as const },
        { campaignId: '24016194648', nome: 'PRODUTOS', orcamentoDiarioBRL: 3, ativa: true, statusNaConta: 'ENABLED' as const },
      ],
    });

  it('pega campanha declarada ativa que esta PAUSED na conta', () => {
    const d = diagnosticar(garboPausadaEscondido());
    const paradas = d.divergencias.filter((x) => x.tipo === 'pausada_sem_aviso');
    assert.equal(paradas.length, 2);
    assert.deepEqual(paradas.map((p) => p.nome).sort(), ['MESAS', 'MOVEIS']);
  });

  it('REGRESSAO 07/08: saldo intacto NAO pode ser lido como saude', () => {
    // O ponto do incidente. Sem gasto, o nivel calculado e 'saudavel' — e era
    // saudavel exatamente porque nada rodava. Verde por ausencia de consumo e
    // o pior tipo de verde: o cliente paga por dias em que nao apareceu.
    const d = diagnosticar(garboPausadaEscondido());
    assert.equal(d.nivel, 'saudavel', 'o nivel de saldo continua otimo');
    assert.match(d.resumo, /PAUSADAS na conta/, 'mas o resumo precisa denunciar');
    assert.match(d.resumo, /nao apareceu|não apareceu/);
  });

  it('divergencia sozinha ja obriga decisao, sem nenhuma recomendacao de corte', () => {
    const conta = diagnosticarConta(685.44, [garboPausadaEscondido()]);
    assert.equal(conta.clientes[0]?.recomendacoes.length, 0, 'nao ha corte a fazer');
    assert.equal(conta.precisaDecisao, true, 'e ainda assim precisa de decisao');
  });

  it('pega campanha veiculando sem estar declarada', () => {
    const d = diagnosticar(
      garbo({
        campanhas: [
          { campaignId: '24016194654', nome: 'CASAMENTOS', orcamentoDiarioBRL: 12, ativa: false, statusNaConta: 'ENABLED' },
        ],
      }),
    );
    const x = d.divergencias.find((v) => v.tipo === 'ativa_sem_declaracao');
    assert.ok(x);
    assert.match(x?.descricao ?? '', /bolso comum/);
  });

  it('pega orcamento gravado diferente do combinado', () => {
    const d = diagnosticar(
      garbo({
        campanhas: [
          { campaignId: '24016194642', nome: 'MOVEIS', orcamentoDiarioBRL: 6, ativa: true, statusNaConta: 'ENABLED', orcamentoNaContaBRL: 10 },
        ],
      }),
    );
    const x = d.divergencias.find((v) => v.tipo === 'orcamento_diferente');
    assert.ok(x);
    assert.equal(x?.esperado, 'R$ 6.00/dia');
    assert.equal(x?.encontrado, 'R$ 10.00/dia');
  });

  it('centavo de arredondamento nao vira divergencia', () => {
    const d = diagnosticar(
      garbo({
        campanhas: [
          { campaignId: '24016194642', nome: 'MOVEIS', orcamentoDiarioBRL: 6, ativa: true, statusNaConta: 'ENABLED', orcamentoNaContaBRL: 6.01 },
        ],
      }),
    );
    assert.equal(d.divergencias.length, 0);
  });

  it('sem statusNaConta consultado, nao inventa divergencia', () => {
    // Ausencia de leitura nao e evidencia de divergencia. Um governador que
    // alarma por dado que nao tem vira ruido e para de ser lido.
    const d = diagnosticar(garbo());
    assert.equal(d.divergencias.length, 0);
    assert.equal(d.nivel, 'saudavel');
  });
});
