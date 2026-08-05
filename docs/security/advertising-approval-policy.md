# Política de aprovação para publicidade

Regras específicas para Google Ads e Meta Ads. Complementam o
[protocolo de aprovação](../../brain/operations/protocolo-de-aprovacao.md).

## Por que publicidade tem política própria

Nos outros domínios, um erro custa tempo. Aqui, custa **dinheiro de terceiros**,
em tempo real, e o gasto não volta.

Três agravantes estruturais desta operação:

1. **Uma conta anunciante para vários clientes** (`265-696-6896`). O isolamento
   é por campanha, não por conta — nada estrutural impede que uma ação atinja o
   cliente errado.
2. **Travas com margem estreita.** Gaveta pausa em R$ 275 de um teto de R$ 280.
   São R$ 5 de folga; um atraso de sincronização consome isso.
3. **Já existe conflito de dados.** No Cassio Ferraz, o orçamento configurado
   (R$ 300) não bate com a verba recebida. Automatizar sobre número incerto
   multiplica a incerteza.

## Classificação

Toda ação de publicidade é **no mínimo Nível 2**. Não há Nível 0 aqui, nem para
leitura de gasto — porque relatório errado orienta decisão errada sobre dinheiro.

| Ação | Nível | Observação |
|---|:--:|---|
| Ler métricas, status, orçamento | 1 | Leitura, mas o número informa decisão financeira |
| Gerar relatório | 1 | Deve declarar data e fonte |
| **Pausar** campanha | 2 | Reversível, mas interrompe entrega contratada |
| **Reativar** campanha | 2 | Volta a gastar |
| Alterar orçamento | 2 | |
| Criar campanha | 2 | |
| Alterar segmentação, criativo, lance | 2 | |
| **Reativar após trava de teto** | **3 — proibido por padrão** | Ver abaixo |
| Ação em lote sobre vários clientes | **3 — proibido** | |
| Remover campanha | **3 — proibido** | |

## A regra da trava

> **Trava atingida nunca se auto-reverte.**

Quando uma campanha é pausada por atingir teto de verba, a reativação:

- **não** pode ser automática, em nenhuma condição;
- **não** pode ser consequência de um cron, gatilho ou workflow;
- exige decisão humana explícita **e** nova autorização de verba;
- exige registro em `DECISIONS.md` com o valor autorizado.

Isso é regra do dono para a Gaveta Produções e vale como padrão para todos.

O motivo é a assimetria: pausar cedo demais custa algumas horas de entrega;
reativar sem autorização gasta dinheiro que ninguém aprovou. A automação deve
falhar para o lado barato.

## Verba nova

Não se presume verba. Nunca.

- Teto anterior não autoriza o próximo lote.
- Campanha pausada por verba não reabre "porque virou o mês".
- Garbo opera por **lote**: cada lote de R$ 100 precisa de nova autorização.
- No Cassio Ferraz, com conflito aberto, **nenhuma verba é presumida** até que
  o valor real seja confirmado.

## Antes de qualquer automação de publicidade

1. Resolver o conflito de verba do Cassio Ferraz
2. Verificar ao vivo o status real de todas as 8 campanhas históricas
3. Confirmar se as travas foram atingidas
4. Verificar se o Google Ads Script da Garbo (`11999683`) ainda roda — script
   ativo é uma automação já em execução, fora do Control Plane
5. Implementar leitura antes de qualquer escrita
6. Só então considerar automação de pausa, com a trava como limite rígido

## O que o Control Plane pode fazer hoje

**Nada.** A ação `meta.campaign.pause` está registrada e é recusada pelo kill
switch. Não há adaptador do Google Ads. Nenhuma credencial de publicidade está
configurada.

Isso é o estado correto para esta fase.

## WhatsApp como microconversão

Cassio Ferraz e Garbo tratam clique no WhatsApp como microconversão. Isso liga
publicidade ao canal de WhatsApp — que continua **fora de escopo** para escrita.

Ler que uma conversão de WhatsApp ocorreu é leitura. Responder a ela é envio de
mensagem, e permanece bloqueado.
