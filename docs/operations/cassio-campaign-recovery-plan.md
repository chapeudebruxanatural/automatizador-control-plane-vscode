# Cássio Ferraz — plano de recuperação

- **Data:** 2026-08-05 · **Fonte:** `live_api` (Google Ads API v21)
- **Conta:** `2656966896` · **Campanha:** `24066140634`
- **`changesMade: 0`** — somente `SELECT`. Nenhuma alteração.

---

## O achado que muda o diagnóstico

**As 5 ações de WhatsApp existem. A mensuração não está quebrada.**

| Métrica | Valor |
|---|---|
| `metrics.conversions` | **0** |
| `metrics.all_conversions` | **5** |
| Ação atribuída | `WHATSAPP - CÁSSIO` |
| Data | **todas em 2026-07-29** |

`conversions` conta apenas ações marcadas como **primárias**.
`WHATSAPP - CÁSSIO` está como **não primária** — por isso não aparece ali.

**O "0 conversões" era artefato de configuração, não ausência de resultado.**
A tag dispara, o evento registra, a atribuição funciona. Qualquer relatório que
tenha lido `conversions` isoladamente concluiu errado — inclusive o meu, na
primeira leitura.

---

## Desempenho por dia

| Data | Custo | Cliques | CPC | WhatsApp |
|---|---|---|---|---|
| 27/07 | R$ 0,19 | 0 | — | 0 |
| 28/07 | R$ 74,91 | 23 | **R$ 3,26** | 0 |
| **29/07** | R$ 72,84 | **554** | **R$ 0,13** | **5** |
| 30–31/07 | — | — | — | — |
| 01/08 | R$ 1,37 | 0 | — | 0 |
| 02/08 | R$ 8,01 | 2 | R$ 4,01 | 0 |
| 03/08 | R$ 8,04 | 4 | R$ 2,01 | 0 |
| 04/08 | R$ 7,58 | 59 | R$ 0,13 | 0 |
| **Total** | **R$ 172,94** | **642** | **R$ 0,27** | **5** |

Sem gasto em 30–31/07: a campanha terminou na data original (29/07) e só voltou
em 01/08, depois da alteração manual.

**Antes da reabertura:** R$ 147,94 · 577 cliques · 5 WhatsApp
**Depois da reabertura:** R$ 25,00 · 65 cliques · 0 WhatsApp

Isso confirma quase exatamente o relato do dono (R$ 26,02 e ~83 cliques).

### Por dispositivo

`MOBILE` concentra R$ 171,76 dos R$ 172,94 e **todos** os 642 cliques e as 5
conversões. Desktop, tablet e TV somam R$ 1,17 sem clique nenhum.

---

## As três hipóteses, com evidência

### A — Mensuração quebrada · **REFUTADA**

5 conversões registradas em `all_conversions`, com ação e data corretas. A tag
funciona.

### B — Problema depois do clique · **PARCIAL, e não é o principal**

Taxa em 29/07: **5 em 554 cliques = 0,9%**.

É baixa para intenção de contratação, e há espaço de melhoria na landing e na
oferta. Mas **não é zero** — o funil converte.

### C — Reabertura degradou a entrega · **CONFIRMADA, e é a causa principal**

O ponto decisivo é aritmético: com taxa de 0,9%, os 65 cliques do período
pós-reabertura deveriam gerar **~0,6 conversões**. Zero não é anomalia — é
**volume insuficiente**.

O problema não é a campanha ter "perdido qualidade". É ela ter **parado de
entregar volume**:

- 29/07 sozinho: 554 cliques
- 01 a 04/08 inteiros: 65 cliques

Queda de ~97% na entrega diária. Causas prováveis, em ordem:

1. **Volta ao aprendizado** após alteração de data e orçamento
2. **CPC instável** — R$ 3,26 em 28/07, R$ 0,13 em 29/07, R$ 4,01 em 02/08.
   `TARGET_SPEND` recalibrando
3. **Orçamento total quase esgotado** — R$ 172,94 de R$ 203,20 configurados

---

## Plano de recuperação

### Passo 1 — Corrigir a leitura, não a campanha *(custo zero)*

Marcar `WHATSAPP - CÁSSIO` como **primária**, ou passar a reportar sempre
`all_conversions` para este cliente.

Hoje qualquer painel que olhe `conversions` mostra zero e sugere fracasso onde
houve resultado. **Esta é a correção de maior valor e menor risco.**

### Passo 2 — Preservar o que funcionou

| Preservar | Motivo |
|---|---|
| Campanha `24066140634` | Já tem histórico de aprendizado e 5 conversões |
| Demand Gen + `TARGET_SPEND` | Entregou 554 cliques a R$ 0,13 |
| Concentração em mobile | 100% das conversões |
| `CASSIO \| LEAD QUALIFICADO \| FORM` como primária | Correto |

**Não criar campanha nova.** Recomeçar joga fora o aprendizado.

### Passo 3 — Teste mínimo

- **Orçamento diário estável**, sem alteração no meio do voo — foi a mudança de
  data e orçamento que causou a queda
- **Janela mínima de 7 dias** sem mexer, para sair do aprendizado
- **Meta de volume:** ~500 cliques, que na taxa atual daria ~4–5 WhatsApp
- **Orçamento estimado:** ~R$ 65 (500 × R$ 0,13). **Não confirmado** — ver
  restrição financeira

### Passo 4 — Regra de pausa

Pausar se: CPC médio > R$ 1,00 por 2 dias seguidos · 200 cliques sem nenhum
WhatsApp (2× a taxa esperada) · gasto atingir o teto autorizado.

**Reativação após pausa nunca é automática.**

### Passo 5 — Como medir sem enganar

| Métrica | O que é | O que **não** é |
|---|---|---|
| Cliques | tráfego | interesse |
| `WHATSAPP - CÁSSIO` | **microconversão** — abriu conversa | lead qualificado |
| `LEAD QUALIFICADO \| FORM` | lead | contrato |
| — | — | show contratado |

**Nenhum clique no WhatsApp é contrato fechado.** Os 5 registrados provam que
5 pessoas iniciaram conversa — não que alguma contratou.

---

## Bloqueio financeiro

**Não presumir R$ 300 autorizados.** O conflito entre orçamento configurado e
verba recebida segue aberto.

Liberado: leitura e diagnóstico.
Bloqueado: aumento de orçamento, reativação, nova campanha, extensão de
período, publicação, qualquer mutate financeiro.

---

## Depende de aprovação do dono

1. Marcar `WHATSAPP - CÁSSIO` como primária *(Nível 2 — muda mensuração)*
2. Reativar `24066140634` com orçamento diário estável *(Nível 2 — gasta)*
3. Confirmar a verba real disponível
4. Decidir sobre `24100207887` e `24103008676` — ver
   `clients/cassio-ferraz/campaigns.yaml`

## Ainda exige verificação

- Landing page e URL final atuais
- Se o evento de WhatsApp dispara em todos os pontos de contato
- Metas de conversão da campanha (padrão da conta ou específicas)
- Histórico de alterações via `change_event`
- Configuração das outras duas Demand Gen
