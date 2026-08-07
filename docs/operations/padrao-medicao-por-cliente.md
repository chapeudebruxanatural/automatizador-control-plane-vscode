# Padrão de medição por cliente — conta compartilhada

**Criado em 2026-08-07.** Conta de anúncios `2656966896`, compartilhada entre
Cássio, Garbo, NovaCena e Gaveta.

## O problema que este padrão resolve

A coluna **"Conversões"** do Google Ads é da **conta inteira**. Ela soma Cássio,
Garbo, NovaCena e Gaveta num número só. Usá-la como resultado de um cliente é
exatamente o que a regra §3.4 do `HANDOFF.md` proíbe.

O que serve para auditar por cliente são **colunas personalizadas**, uma por
ação de conversão. Elas funcionam **independente de a ação ser primária ou
secundária** — e é por isso que manter as ações como **secundárias** é o certo
nesta conta: promover a primária mistura a linha de base de todos os clientes,
sem ganho nenhum para a auditoria.

## Checklist obrigatório para cliente novo

Cliente que ganha tag precisa das **quatro** coisas abaixo. Faltando qualquer
uma, ele nasce invisível para auditoria ou inalcançável pelo control plane.

**1. Ação de conversão no Google Ads.**
Nome no formato `<EVENTO> | <CLIENTE>`. Marcar como **Ação secundária** —
ver acima. Contagem: `Uma conversão`. Janela de clique: 30 dias.

**2. Coluna personalizada.**
`Colunas → Modificar colunas → + Coluna personalizada`.

- **Nome:** `<Evento> | <CLIENTE>` — ex.: `WhatsApp | GARBO`
- **Descrição:** o que ela mede e de quem
- **Formato:** Número (123)
- **Fórmula:** métrica `Todas as conversões`, filtrada por
  `Ação de conversão → <a ação daquele cliente>`

Use **`Todas as conversões`**, nunca `Conversões` — a segunda só conta ações
primárias e devolveria zero para as ações secundárias desta conta.

**3. Conjunto de colunas.**
Adicionar a coluna nova ao conjunto `AUDITORIA | TODOS OS CLIENTES`, que mostra
todos os clientes lado a lado. Conjuntos por cliente (`CÁSSIO`, `GARBO`) são
para olhar um de cada vez.

**4. Entrada no `scope.ts`.**
`packages/integrations/src/google-ads/scope.ts`, em `AUTHORIZED_CAMPAIGNS`, com
`campaignId`, `clientSlug` e `lifecycle`. Sem isso o control plane não lê nem
escreve naquela campanha — o `assertAuthorizedCampaign` recusa por design.

## Estado em 07/08/2026

| Cliente | Ação de conversão | Coluna | scope.ts |
|---|---|---|---|
| cassio-ferraz | `WHATSAPP - CÁSSIO` (Ativa, secundária) | `CÁSSIO - WHATSAPP` | ✅ 24066140634 e 24106867845 (`active_scope`) |
| cassio-ferraz | `CASSIO \| LEAD QUALIFICADO \| FORM` (Inativa) | `CÁSSIO - FORMULÁRIOS` | ✅ |
| garbo-eventos | `WHATSAPP - GARBO` (Ativa, secundária) | `WhatsApp \| GARBO` | ✅ 5 campanhas (`read_only_scope`) |
| novacena | `WhatsApp Click - NovaCena Motion` | `WhatsApp \| NOVACENA` (criada 07/08) | ✅ 2 campanhas (`read_only_scope`) |
| gaveta-producoes | — | — | ✅ 24105770570 (`frozen_by_owner`) |
| vivere, soulraizes, chapeu-de-bruxa | — | — | ❌ sem tag ainda |

### `read_only_scope` — o quinto item do checklist, na prática

Entrar no `scope.ts` **não** é o mesmo que ficar operável. Garbo e NovaCena
entraram em 07/08 como `read_only_scope`: o leitor alcança, o escritor recusa.
É o estado padrão de cliente novo. Promover a `active_scope` é decisão do dono,
uma campanha de cada vez — e há teste que quebra se outro slug virar gravável
sem que alguém tenha decidido isso.

### Colher o ID da campanha sem errar

Os IDs saem do `href` da própria linha na lista de campanhas. O `href` é
**preenchido sob demanda**: a linha nasce sem ele e só recebe o endereço depois
de um clique ou hover real naquela linha.

Isso convida ao atalho errado. A primeira coleta de 07/08 inferiu a associação
por proximidade no HTML e **errou três dos cinco** nomes da Garbo — sem erro
visível, porque IDs plausíveis e nomes plausíveis se combinam em silêncio.
Clique linha por linha. É `verificationStatus: verified` contra `discovered`.

### O que a coluna da Garbo vai mostrar — e por quê

**As cinco campanhas da Garbo estão pausadas**, quatro delas marcadas pelo
Google como `Limitada pelo orçamento`, com verbas de R$ 3 a R$ 12/dia. As duas
da NovaCena também estão pausadas. O total diário da conta é R$ 50 — só o
Cássio.

Então `WhatsApp | GARBO` vai marcar zero. Zero aqui significa **"não rodou"**,
não "rodou e não converteu". A distinção é a diferença entre um problema de
verba e um problema de anúncio.

**Pendência remanescente:**

`CASSIO | LEAD QUALIFICADO | FORM` está **Inativa**: nenhuma conversão em 30
dias. A cadeia de medição parece íntegra (`site.js` empurra `form_submit`, o
container `GTM-5JGMZBKZ` tem o gatilho no mesmo padrão do `whatsapp_click`, que
foi provado ponta a ponta). A hipótese principal é que **ninguém completava o
formulário** — eram 11 campos com 5 obrigatórios. Em 07/08 caiu para 2
obrigatórios. Se seguir zerada com volume, aí sim investigar a tag.

## Inconsistência de nomenclatura

Os nomes seguem dois padrões diferentes:

- `CÁSSIO - WHATSAPP` e `CÁSSIO - FORMULÁRIOS` — `CLIENTE - EVENTO`
- `WhatsApp | GARBO` e `WhatsApp | NOVACENA` — `Evento | CLIENTE`

Não foi unificado para não quebrar os conjuntos de colunas já salvos. **Para
cliente novo, use `<Evento> | <CLIENTE>`**, que é o padrão mais recente e ordena
melhor quando há vários eventos por cliente.
