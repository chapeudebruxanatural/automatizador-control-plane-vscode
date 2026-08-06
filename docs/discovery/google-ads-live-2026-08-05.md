# Google Ads — primeira leitura ao vivo

- **Data:** 2026-08-05
- **Autenticação:** conta de serviço (`service_account`), chave em diretório protegido, modo `600`
- **API:** `v21` · **login-customer-id:** `3992594849` · **conta:** `2656966896`
- **Alterações realizadas:** **nenhuma** — somente `searchStream` e `listAccessibleCustomers`

> `liveReadVerified: true` a partir desta data. Nenhuma rota `:mutate` foi tocada.

## Autenticação

`listAccessibleCustomers` → `customers/3992594849` (a MCC), request-id
`p8kvVJZJoP3rc-5FuD58Jw`, 1035 ms.

A conta anunciante `2656966896` **não aparece** nessa lista — é comportamento
esperado: ela é filha da MCC e se acessa via `login-customer-id`. Confirmado
por consulta bem-sucedida direto nela.

**A conta de serviço funcionou sem delegação em todo o domínio.** A ressalva
que eu havia registrado (exigir Google Workspace) não se materializou: o
e-mail da conta de serviço já está vinculado como usuário da conta do Ads.

## Achado 1 — CRÍTICO: Cássio Ferraz com 642 cliques e ZERO conversões

Campanha `24066140634` — `CASSIO | DEMAND_GEN | VIDEO_DVD | CONTRATANTES | BRASIL_PRIORITARIO`

| Métrica (30 dias) | Valor |
|---|---|
| Status | `PAUSED` (motivo: `CAMPAIGN_PAUSED`) |
| Período | 2026-07-27 a 2026-08-08 |
| Estratégia de lance | `TARGET_SPEND` |
| **Custo** | **R$ 172,94** |
| Impressões | 10.859 |
| Cliques | 642 |
| CTR | ~5,9% |
| **Conversões** | **0** |

**R$ 172,94 gastos, 642 cliques, nenhuma conversão registrada.**

CTR de 5,9% é alto para Demand Gen — a criação e a segmentação estão
atraindo clique. O problema está depois do clique: ou a mensuração não está
registrando, ou a página não converte.

Isto **precisa ser investigado antes de qualquer nova verba**, e reforça o
conflito financeiro já documentado: gastar mais sem saber por que 642 cliques
não viraram um único lead é queimar orçamento.

Hipóteses, em ordem de probabilidade:
1. Tag de conversão não dispara na página de destino
2. Landing page sem formulário funcional ou com fricção alta
3. Conversão configurada mas não vinculada a esta campanha

## Achado 2 — Buteco Sertanejo: anúncio reprovado por direitos autorais

Campanha `24105770570` — `DG | Buteco Sertanejo | Shorts | Spotify`
**(ID localizado por correspondência exata do nome)**

| Campo | Valor |
|---|---|
| Status | `ENABLED` — **única campanha ativa da conta** |
| Primary status | **`NOT_ELIGIBLE`** |
| Motivos | `BIDDING_STRATEGY_LEARNING`, **`HAS_ADS_DISAPPROVED`** |
| Período | 2026-08-05 a 2026-08-11 (começou hoje) |
| Entrega | **zero** — 0 impressões, 0 cliques, R$ 0,00 |

**Anúncio:** ad group `199026733436`, ad `819900433355`, status `ENABLED`,
aprovação **`DISAPPROVED`**, review `REVIEWED`.

**Política violada:** `COPYRIGHTED_CONTENT`, severidade `FULLY_LIMITED`.

A campanha está ligada e não entrega nada porque o único anúncio dela está
reprovado por conteúdo protegido por direitos autorais. `FULLY_LIMITED`
significa bloqueio total, não veiculação restrita.

Conforme instrução: **não contestado, não editado, vídeo não substituído.**

## Achado 3 — mistura de conversões entre clientes na mesma conta

Seis ações de conversão ativas, de clientes diferentes, na conta compartilhada:

| Ação | Categoria | Primária? |
|---|---|---|
| `Begin Checkout - NovaCena Motion` | BEGIN_CHECKOUT | **sim** |
| `WhatsApp Click - NovaCena Motion` | CONTACT | **sim** |
| `Purchase - Assinatura NovaCena Motion` | PURCHASE | **sim** |
| `WHATSAPP - GARBO` | REQUEST_QUOTE | não |
| `WHATSAPP - CÁSSIO` | REQUEST_QUOTE | não |
| `CASSIO \| LEAD QUALIFICADO \| FORM` | SUBMIT_LEAD_FORM | **sim** |

**Ponto positivo:** `WHATSAPP - CÁSSIO` está como **não primária**, e
`CASSIO | LEAD QUALIFICADO | FORM` como primária. Está correto — a
microconversão não está inflando a otimização, que era o risco registrado na
estratégia v2.

**Ponto de atenção:** três conversões da NovaCena estão marcadas como
primárias na mesma conta que atende Cássio e Garbo. Numa conta compartilhada,
isso significa que campanhas de clientes diferentes podem otimizar contra
sinais que não são deles. Vale verificar o escopo de cada conversão por
campanha.

## Campanha da Gaveta Produções

`24079586567` — `(187 Visualizações) Leão e Lorenzo | Agora Ou Nunca Mais (Ao Vivo)`
Status `PAUSED`. Registrada como `removed_by_owner`: não reativada, não
monitorada como ativa. Existem ainda `23971988835` e `24027538542`, do mesmo
projeto, também pausadas.

## Panorama da conta

40+ campanhas, quase todas `PAUSED`. Apenas **uma** `ENABLED` — a do Buteco,
que não entrega por reprovação. Na prática, **a conta não está veiculando nada
neste momento.**

Também presentes: as 5 campanhas `GARBO | SEARCH | …` (Campinas), pausadas, e
`CASSIO | SEARCH | LEADS_SHOW | REGIONAL_SP | PILOTO` (`24073903393`), pausada.
Há ainda duas variações adicionais da Demand Gen do Cássio (`#2` e `#3`), que
não constavam do histórico informado.

## Nada foi alterado

Somente `SELECT` via `searchStream`. Nenhuma campanha pausada, reativada,
editada ou com orçamento alterado. Nenhum anúncio contestado.
