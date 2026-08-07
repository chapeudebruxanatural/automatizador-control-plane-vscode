# Protocolo de campanha pré-paga

**Criado em 07/08/2026.** Vale para todo cliente que abastece a campanha por
Pix, em vez de pagar mensalidade fixa.

## O modelo, dito com honestidade

O cliente manda dinheiro quando quer, no valor que quer. O dono transfere para
a conta de anúncios. A campanha consome. Quando acaba, o cliente manda mais —
ou some por uma semana.

É crédito de celular. E como crédito de celular, tem dois defeitos que o
protocolo precisa cobrir, não esconder:

1. **O saldo é da conta, não do cliente.** Google Ads não tem carteira por
   campanha. Numa conta compartilhada, o clique de um cliente é pago com o
   dinheiro que estiver lá — de quem for.
2. **Campanha que apaga e acende não é igual a campanha que ficou no ar.** Só
   que o tamanho desse prejuízo depende do tipo de lance, e é bem menor do que
   a intuição sugere. Ver abaixo.

## 1. Quando pausar dói de verdade — e quando não dói

A frase "perde o aprendizado" virou pânico genérico. Ela tem endereço.

| Estratégia de lance | O que se perde ao ficar dias parado |
|---|---|
| **CPC manual** | Quase nada de algorítmico. Não há modelo de lance aprendendo. Perde-se presença e histórico recente de CTR, que voltam rápido. |
| **Maximizar cliques** | Pouco. Recalibra em dias. |
| **Maximizar conversões / CPA desejado / ROAS** | Muito. [O período de aprendizado leva de 2 a 6 semanas](https://www.groas.com/post/google-ads-smart-bidding-learning-period-2026-how-long-resets-shorten), e campanha com menos de 15 conversões por semana pode **nunca sair dele**. Cada reset custa de 1 a 3 semanas de performance instável. |

Na conta em 07/08/2026:

- **Garbo — as 5 campanhas são CPC manual.** Ligar e desligar aqui é barato.
  O que estava travando a Garbo nunca foi aprendizado; era verba.
- **`VENDAS - NOVACENA MOTION` é Maximizar conversões.** É a única com
  aprendizado caro de verdade. Reativação dela merece cuidado extra.
- **Cássio é Demand Gen com Maximizar cliques.** Meio-termo.

**Regra:** antes de pausar, olhe o tipo de lance. Pausar CPC manual é decisão
operacional; pausar lance inteligente é decisão que custa semanas.

## 2. Piso em vez de pausa

Decisão do dono em 07/08: **campanha não sai do ar.** Quando o saldo do cliente
acaba, o orçamento diário cai para **R$ 1,00/dia** em vez de a campanha ser
pausada.

Por que vale a pena:

- o histórico fica contínuo, sem o degrau de reativação;
- a campanha não volta do zero em ad rank e frequência;
- e o mais prático: **religar é mudar um número**, não recriar contexto.

O que custa: até cerca de R$ 30/mês por cliente parado, **do bolso do dono**.
É um float deliberado. Está registrado aqui para que ninguém o descubra depois
como surpresa na fatura.

Exceção sensata: se o cliente sumir por mais de 30 dias, pause de fato. Float
tem prazo.

## 3. A conferência que impede a mistura

Este é o item que protege o dono, e é o que não pode ser pulado.

Toda semana, para cada cliente:

1. some `metrics.cost_micros` das campanhas dele (IDs em `scope.ts`);
2. compare com `depositado` em `inventory/saldo-por-cliente.yaml`;
3. **gasto acima do depositado significa que aquele cliente consumiu dinheiro
   de outro.** Não é erro de sistema — é o comportamento normal de um bolso
   compartilhado. O erro é não perceber.

Sem esse passo, o modelo pré-pago numa conta compartilhada vira, na prática,
o dono financiando quem gasta mais rápido sem saber que está financiando.

### O governador — quem faz essa conferência

`npm run governador` (`scripts/governador-orcamento.mts`). **Somente leitura.**
Lê o gasto por cliente na API, cruza com este arquivo e imprime o diagnóstico
com a recomendação de orçamento. Não aplica nada: termina imprimindo o comando
de aplicação, que passa por `planCampaignBudget` e exige hash de aprovação.

Sai com código `3` quando há decisão pendente e `0` quando não há — para o
agendador distinguir "está tudo bem" de "precisa de você".

**Níveis:**

| Nível | Quando | O que faz |
|---|---|---|
| `saudavel` | 3+ dias de saldo | nada |
| `atencao` | 1 a 3 dias | avisa. **Não mexe em orçamento** — mudar orçamento pode reiniciar aprendizado, e ainda há folga |
| `critico` | menos de 1 dia | recomenda reduzir ao teto seguro |
| `estourado` | gasto > depositado | recomenda o piso, e diz **quanto já saiu da fatia de outro cliente** |

**As duas margens que a intuição erra**, e que estão em teste:

1. **Teto seguro é `restante ÷ 2`, não `restante`.** Com R$ 10 sobrando, um
   orçamento de R$ 10/dia pode virar R$ 20 gastos, porque o Google gasta até 2×
   o diário num dia isolado e compensa depois — mas o saldo do cliente já foi.
2. **Desconta o gasto que ainda não apareceu no relatório.** Entre duas
   execuções há consumo real e invisível. Tratar o número do relatório como
   verdade subestima o gasto justamente quando a margem é menor. Há teste
   mostrando um caso que passa de `atencao` para `critico` só por causa disso.

Ambas erram para o lado de parar cedo. Num modelo pré-pago, parar cedo custa
horas de veiculação; parar tarde custa o dinheiro de outro cliente.

**O governador nunca sobe orçamento.** Aumentar gasto só faz sentido diante de
depósito novo, e é o dono quem sabe que o depósito entrou. Governador que sobe
orçamento sozinho deixa de ser freio e vira acelerador. Há teste varrendo
combinações de gasto e atraso para garantir que toda recomendação é para baixo.

**Cliente sem fatia declarada aparece como `SEM GOVERNO`.** Campanha ativa,
gastando, e sem depósito nem rateio em lugar nenhum, consome do bolso comum sem
teto. A primeira versão do script simplesmente pulava esses clientes — o que
deixava o Cássio, que gasta mais rápido que todos, como o único fora do
governo. Silêncio ali não é ausência de risco.

**Alerta que o monitor precisa passar a dar:** saldo restante do cliente abaixo
de 2 dias de orçamento diário. Dois dias é o tempo de mandar mensagem, o
cliente ver, fazer o Pix e o dinheiro cair.

## 4. Dimensionar o depósito

Não existe "o valor certo". Existe a conta:

```
dias no ar = depósito ÷ orçamento diário total
```

Os R$ 100 da Garbo em 07/08: R$ 14/dia → 7 dias.

A escolha entre poucos dias com verba alta e muitos dias com verba baixa é
real, e a resposta depende do histórico:

- **A Garbo produziu 29 conversas de WhatsApp com R$ 221,60**, rodando a R$ 3–12
  por dia. Custo por conversa: R$ 7,64. Verba baixa **funcionou** para ela.
  Então esticar faz sentido: mais dias no ar, mesmo total de conversas.
- Campanha que nunca provou nada em verba baixa é o caso oposto — concentre,
  colete dado utilizável, decida depois.

Rateio dos R$ 100 proporcional às conversas geradas, excluindo as duas que não
produziram:

| Campanha | Conversas | Fatia | Orçamento diário |
|---|---|---|---|
| MOVEIS EVENTOS | 11 | 41% | R$ 6,00 |
| MESAS CADEIRAS | 10 | 37% | R$ 5,00 |
| PRODUTOS ESPECIFICOS | 6 | 22% | R$ 3,00 |
| CASAMENTOS EVENTOS | 2 | — | pausada |
| MARCA | 0 | — | pausada |

> **Ressalva que a proporção esconde:** distribuir por volume premia quem
> gastou mais, não quem converteu mais barato. `PRODUTOS ESPECIFICOS` entrega
> conversa a **R$ 2,36** e `MOVEIS EVENTOS` a **R$ 11,07** — quase 5× mais
> caro. Se o objetivo virar custo por conversa em vez de volume, a ordem se
> inverte. Vale rever no próximo depósito, com o dado deste ciclo em mãos.

## 5. O relatório para o cliente

O que a Andréia precisa ver, e nada além:

- quanto depositou e quanto foi consumido;
- quantas conversas de WhatsApp saíram disso;
- quanto custou cada conversa;
- quantos dias ainda restam no ar.

O número vem da **coluna personalizada daquele cliente**
(`WhatsApp | GARBO`), nunca da coluna "Conversões" da conta — que soma todo
mundo. O porquê está em `padrao-medicao-por-cliente.md`.

## 6. A pergunta de fundo que segue aberta

Contas de anúncio separadas por cliente resolvem tudo isto na raiz: cada um com
seu saldo, sem rateio declarado, sem conferência semanal, sem risco de um
consumir o outro.

O custo é migração e perda do histórico das campanhas atuais. Com quatro
clientes ativos, a conferência semanal ainda é mais barata. **Com sete ou oito,
não vai ser** — e a hora de migrar é antes de o volume tornar o erro caro, não
depois.

## Checklist operacional

**Ao receber um Pix:**

1. lançar em `inventory/saldo-por-cliente.yaml` (data, valor, origem — nunca
   dado bancário);
2. transferir para a conta de anúncios;
3. definir `horizonteDias` e ajustar os orçamentos diários;
4. tirar as campanhas do piso de R$ 1,00.

**Quando o saldo acabar:**

1. baixar o orçamento diário para R$ 1,00 — **não pausar**;
2. avisar o cliente com o relatório do ciclo em mãos;
3. se passar de 30 dias sem depósito, aí sim pausar.

**Toda semana:**

1. gasto por cliente × depositado;
2. divergência acima de R$ 20 vira linha no relatório, não silêncio.
