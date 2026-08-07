# HANDOFF — AutomatizadorIA Control Plane

Documento de transferência. **Atualizado 2026-08-06.** Cole inteiro como contexto
inicial. O que mudou em 06/08 está nas seções §6, §6.1, §7.6, §12 e §13.

Tudo aqui foi verificado na data acima. Comando documentado é comando executado;
número foi lido da API, não estimado. Onde não deu para verificar, está escrito
**NÃO VERIFICADO** — e isso é informação, não lacuna a preencher com suposição.

---

## 0. LEIA ISTO PRIMEIRO

Três coisas que mudam a forma de trabalhar neste repositório:

1. **Existe dinheiro real em jogo agora.** A campanha do Cássio está ativa,
   gastando, com R$ 300 disponíveis até 20/08. Não é ambiente de teste.
2. **A conta de anúncios é compartilhada** entre Cássio, Garbo, NovaCena e
   Gaveta. Alteração em propriedade de conta afeta todos. Isolamento é por
   campanha, via allowlist em `scope.ts`.
3. **Inferência não vira fato.** Todo dado carrega `verificationStatus`. Já
   houve um caso concreto de erro por deduzir: `encantaria_artesanal` foi
   classificado como commit acidental lendo só o GitHub, e tinha stack em
   produção há 6 semanas.

---

## 1. O QUE É

Repositório privado central da operação AutomatizadorIA. Reúne inventário de
infraestrutura, contexto de clientes e automação com trava de segurança.

**Repo:** `dadocruz/automatizador-control-plane` (privado)
**Local:** `/Users/dadocruz/Projetos/automatizador-control-plane`

| Ref | Estado |
|---|---|
| `main` | `d91a670` — Ciclo 1 + 2 mesclados |
| `feat/operational-stabilization-v1` | mesclada (PR #1) |
| `feat/google-ads-live-operations-v1` | **ativa** — PR #2 draft, **não mesclada** |

**Continue em `feat/google-ads-live-operations-v1`.** Ela está ~16 commits à
frente da `main`. Não trabalhe na `main`. Não mescle o PR #2 sem revisão.

---

## 2. VALIDAÇÃO DO AMBIENTE

Rode isto antes de qualquer coisa:

```bash
npm ci && npm run verify && npm run scan:secrets:all
```

Resultado esperado, verificado em 05/08:

| Comando | Estado | Observação |
|---|---|---|
| `npm run lint` | OK | ESLint |
| `npm run typecheck` | OK | `tsc --noEmit` |
| `npm test` | OK | **218 testes, 62 suítes, 11 arquivos, 0 falhas** (contagem conferida no HEAD `3eb706d` em 06/08; o valor anterior, 168/48, era de antes do `packages/agent/`) |
| `npm run build` | OK | gera `dist/apps/api/src/main.js` |
| `npm run scan:secrets` | OK | arquivos em stage |
| `npm run scan:secrets:all` | OK | repositório inteiro |
| `npm run verify` | OK | lint + typecheck + test + build |

**Node:** exigido `>=20.11.0`. Testado localmente em **v24.14.0**. CI roda nos
dois extremos, 20.11.0 e 24 — de propósito: `node --test` só aceita glob a
partir do Node 21, e a suíte já quebrou por isso. Por isso a descoberta de
testes é feita com `find` em `scripts/run-tests.sh`, não com glob.

**Dependência de runtime: uma só** (`zod`). Deliberado — o processo segura
credencial de produção, então superfície de supply chain importa. Não adicione
dependência com acesso a rede ou credencial sem aprovação.

---

## 3. REGRAS QUE NÃO PODEM SER QUEBRADAS

1. **Segredo nunca entra em arquivo versionado.** Nem em exemplo, log,
   inventário ou mensagem de commit. `npm run scan:secrets` antes de commitar.
   O scanner reporta arquivo, linha e tipo provável — **nunca o valor**.
2. **VPS é somente leitura.** `scripts/collect-vps-inventory.sh` recusa comando
   mutante em código, não por disciplina. Nunca reiniciar, parar, remover,
   instalar, atualizar ou fazer `prune`.
3. **Contas Google separadas.** `contato.automatizadoria@gmail.com` (canônica)
   e `estudionovacena@gmail.com` (Novacena) não se misturam — nem arquivo, nem
   e-mail, nem agenda, nem recurso.
4. **Conta de anúncios compartilhada.** Nunca usar "todas as conversões da
   conta" como resultado de um cliente.
5. **Clique ≠ lead ≠ contrato.** `WHATSAPP - CÁSSIO` é microconversão.
   `CASSIO | LEAD QUALIFICADO | FORM` é lead. Não confundir no relatório.
6. **Nunca `force push`. Nunca apagar recurso.**
7. **Kill switch (`CONTROL_PLANE_KILL_SWITCH`) começa ligado.** Nenhuma ação
   externa com efeito colateral roda sem desligamento explícito e aprovado.

### Peça aprovação antes de

Desligar o kill switch · rodar em `EXECUTION_MODE=live` · qualquer escrita em
VPS, n8n, Cloudflare, DNS ou banco · alterar repositório que não seja este ·
criar/pausar/editar campanha · enviar mensagem ou publicar · apagar qualquer
coisa · adicionar dependência com rede ou credencial.

**Não precisa pedir para:** ler, inventariar, documentar, rodar
lint/typecheck/teste/build, corrigir erro reversível dentro deste repositório.

---

## 4. ARQUITETURA

Portas e adaptadores. A separação leitura/escrita é estrutural, não
convenção: o adaptador de leitura **não tem método de escrita na interface**.

```
packages/
  domain/       action.ts  actions.ts  executor.ts  result.ts  verification.ts
  security/     approval.ts  kill-switch.ts
  shared/       config.ts  logger.ts  redact.ts
  audit/        audit.ts
  integrations/
    ports/        adapters.ts  secret-provider.ts
    adapters/     mock.ts                    ← só mock
    google-ads/   credential-provider.ts  transport.ts  scope.ts
                  read-adapter.ts  write-adapter.ts     ← ÚNICO ao vivo
    evolution/    9 módulos                  ← pronto, não conectado
    n8n/          parser.ts                  ← lê export, não chama API
    cloudflare/   parser.ts                  ← lê export, não chama API
apps/
  api/          server.ts  main.ts  routes/  ← webhook do WhatsApp
  worker/       main.ts
tests/          11 arquivos, 218 testes, 62 suítes
scripts/        17 arquivos
```

**Estado real de conexão** — o ponto estrutural mais importante:

| Integração | Estado |
|---|---|
| Google Ads | **ao vivo**, leitura e escrita, usada em produção |
| Evolution / WhatsApp | construída e testada, **número real não conectado** |
| n8n | parser de export. **Sem API key** |
| Cloudflare | parser de export. **Sem token** |
| VPS | inventário por SSH, somente leitura |

A fundação está sólida, mas só **um braço opera**. Não abra integração nova
antes de o que está ao vivo ter vigilância.

---

## 5. GOOGLE ADS — CONECTADO

| Item | Valor |
|---|---|
| MCC / `login-customer-id` | `3992594849` |
| Conta anunciante | `2656966896` (compartilhada) |
| Autenticação | conta de serviço, **sem** delegação de domínio |
| Chave | `~/Documents/Codex/.secrets/google-ads/service-account.json` — modo `600`, verificado |
| Developer token | `.env` → `GOOGLE_ADS_DEVELOPER_TOKEN` — modo `600`, fora do Git |
| **API** | **`v22`** — ver abaixo, mudou hoje |
| Nível de acesso | Básico |

A conta de serviço **já está vinculada como usuária** da conta do Ads. Foi por
isso que funcionou sem Workspace — a ressalva registrada antes não se
materializou.

### 5.1 A v21 foi bloqueada — corrigido hoje

No fim de 05/08 o monitor quebrou sozinho, sem nenhuma mudança no repositório:

```
UNSUPPORTED_VERSION
"Version v21 is deprecated. Requests to this version will be blocked."
```

O bloqueio do Google é **progressivo**, então a mesma consulta alternava entre
200 e 400. Lint, typecheck, teste e build seguiam verdes — nada local acusava.

Versões testadas contra a conta real, com as seis consultas em uso:

| Versão | Consultas | `start_date` / `end_date` |
|---|---|---|
| v21 | intermitente | — bloqueada |
| **v22** | **6/6 OK** | **OK** ← escolhida |
| v23 | 6/6 OK | `UNRECOGNIZED_FIELD` |
| v24 | 6/6 OK | `UNRECOGNIZED_FIELD` |
| v25 | 6/6 OK | `UNRECOGNIZED_FIELD` |
| v26 | HTTP 404 | não existe |

**Fixado em v22, não na mais nova.** A partir da v23 os campos de data somem, e
é por eles que o plano de recuperação estende a data final da campanha. Subir
direto para a v25 não quebraria build nem teste — quebraria a operação de data
em produção, em silêncio.

Escrita revalidada na v22 com `validateOnly` e valor idêntico ao atual (zero
alteração): **HTTP 200**, request-id `FftynTF3-BsVNs6o3CinNA`.

Há dois testes travando isso em `tests/google-ads/boundaries.test.ts`: um recusa
versão bloqueada, outro impede passar da v22 sem antes resolver os campos de
data. **Para migrar adiante: descubra o substituto dos campos de data, ajuste o
`write-adapter`, e atualize o teste junto.**

### 5.2 Módulo

| Arquivo | Função |
|---|---|
| `credential-provider.ts` | Lê a chave **por caminho**, nunca por valor. Falha fechada. |
| `transport.ts` | JWT com `node:crypto` → access token → REST. Sem SDK. `sanitize()` limpa segredo de qualquer erro. |
| `scope.ts` | Allowlist de conta e campanha. Impede ler campanha de um cliente declarando outro. |
| `read-adapter.ts` | 10 operações. `assertReadOnlyQuery` recusa GAQL que não comece com `SELECT`. |
| `write-adapter.ts` | `validateOnly` → plano → hash → aprovação → execução. |

### 5.3 Fluxo de escrita

```
planCampaignStatus() / planCampaignBudget()
  → valida com validateOnly: true      (Google confirma sem executar)
  → devolve MutationPlan + hash SHA-256 do payload
  → execute(plan, hash)                 só roda se o hash bater
```

O hash é **recalculado na execução**. Plano alterado depois de aprovado não
roda. Um plano não serve para outra operação.

Só existem duas operações: status de campanha e valor de orçamento. Não há
criação, remoção, mudança de lance, de meta de conversão nem edição de anúncio.

### 5.4 Descobertas da API que custaram tentativa e erro

- Orçamento do Cássio é **`CUSTOM_PERIOD`** (total do período), não diário.
  Gravar `amount_micros` devolve `INVALID_ARGUMENT` — o campo é
  **`total_amount_micros`**.
- **Tipo de orçamento é imutável** (`IMMUTABLE_FIELD`). Não dá para converter
  total → diário; só criar orçamento novo.
- **Estender a data antes de subir o orçamento falha** com
  `BUDGET_BELOW_PER_DAY_MINIMUM`. **A ordem importa: orçamento primeiro.**
- `listAccessibleCustomers` devolve **só a MCC**. A conta filha se acessa via
  `login-customer-id`.
- `campaign.start_date` / `end_date` existem até a **v22**. Removidos na v23.

---

## 6. O QUE FOI EXECUTADO (05/08/2026)

Campanha do Cássio `24066140634`, autorizado pelo dono:

| Operação | De → Para | `validateOnly` | Request ID |
|---|---|:--:|---|
| Orçamento total | R$ 203,20 → **R$ 472,94** | sim | `DxGYRwSfTPNL-a6e1duZ9w` |
| Data final | 08/08 → **20/08** | sim | `N7aI1EH774GQZDYEoVr-Ng` |
| Status | PAUSED → **ENABLED** | sim | `ajgCun7HloI0XhndrUpo5g` |
| `WHATSAPP - CÁSSIO` `primary_for_goal` | false → true | **não** | `xMbYjE0H2R9w7f6h9evw8A` |
| ↳ **REVERTIDA** | true → **false** | sim | `J2oEmOcK-ehjc17EP6TRQw` |

**06/08 — a mesma alteração foi refeita por engano e revertida de novo.** Sessão
rodou sem acesso ao repositório, não leu este documento, e reapresentou a
divergência do §7.1 como achado novo. Feito pela interface (`Ação secundária` →
`Ação principal`), revertido no mesmo dia. Estado final: **`Ação secundária`**,
igual ao que 05/08 deixou. **Regra: sem `HANDOFF.md` lido, não se altera
propriedade de conta compartilhada.**

Auditoria completa em `audit/google-ads.jsonl` (fora do Git, contém request IDs).

### 6.1 Falhas de processo — registradas para não repetir

- **A alteração da conversão foi a única sem `validateOnly` prévio.**
- **`primary_for_goal` é propriedade da ação na conta, não da campanha.** Numa
  conta compartilhada isso muda a linha de base de relatório de todos. Foi
  afirmado isolamento por raciocínio, sem teste. **Revertida.**
- **Landing page, botão do WhatsApp e tag: NÃO VERIFICADOS** antes de liberar os
  R$ 300. Falha de sequência — o teste deveria ter vindo antes da verba.
  **Resolvido em 06/08 — ver §7.6. A landing está aprovada.**
- **Overclaim de resultado:** "já está funcionando" foi dito comparando cliques
  da interface com dados da API, que estavam em janelas diferentes.
- **`MONITOR_NOT_DEPLOYED`** — foi dito que havia monitor rodando. Não havia
  processo persistente.

### 6.2 Correção estatística

"300 cliques sem contato prova defeito" está **errado**. Com p = 0,9%,
P(zero em 300) = **6,6%**. É alerta forte, não prova. Prova exige ~600 cliques
(P ≈ 0,4%).

---

## 7. DIAGNÓSTICO DO CÁSSIO — LEIA ANTES DE MEXER

Campanha `24066140634` — `CASSIO | DEMAND_GEN | VIDEO_DVD | CONTRATANTES | BRASIL_PRIORITARIO`

| Campo | Valor (v22, 05/08) |
|---|---|
| Status | `ENABLED` / `ELIGIBLE` / `SERVING` |
| Canal | `DEMAND_GEN` |
| Lance | `TARGET_SPEND` (Maximizar cliques) |
| Orçamento | `CUSTOM_PERIOD`, R$ 472,94 — id `15746425389` |
| Período | 27/07 → 20/08 |
| Anúncio | `818466618702` — `DEMAND_GEN_VIDEO_RESPONSIVE_AD`, `ENABLED`, `APPROVED` |

**URL final do anúncio** — é esta landing que precisa ser testada:

```
https://cassioferraz.com.br/contratar-show/?lp=proposta&utm_source=youtube&utm_medium=paid_video&utm_campaign=cassio_video_dvd&utm_content=rotacao_5_videos
```

### 7.1 O achado que inverteu a conclusão

`metrics.conversions` = **0**, `metrics.all_conversions` = **5**.

Não se contradizem: `conversions` conta **só ações primárias**, e
`WHATSAPP - CÁSSIO` era não primária. **As 5 conversões sempre existiram.** O
"zero conversões" era artefato de configuração, não ausência de resultado.

### 7.2 Por dia

| Data | Custo | Cliques | CPC | WhatsApp |
|---|---|---|---|---|
| 27/07 | R$ 0,19 | 0 | — | 0 |
| 28/07 | R$ 74,91 | 23 | R$ 3,26 | 0 |
| **29/07** | R$ 72,84 | **554** | **R$ 0,13** | **5** |
| 01/08 | R$ 1,37 | 0 | — | 0 |
| 02/08 | R$ 8,01 | 2 | R$ 4,00 | 0 |
| 03/08 | R$ 8,04 | 4 | R$ 2,01 | 0 |
| 04/08 | R$ 7,58 | 59 | R$ 0,13 | 0 |

**Acumulado 30d: R$ 172,94 · 642 cliques · 5 contatos.** 100% do resultado veio
de **mobile**. Disponível até o teto: **R$ 300,00**.

**05/08 ainda não materializou na API** — a interface mostrava mais cliques que
a API. Reporting lag. Não tratar divergência interface × API como resultado.

### 7.3 As três hipóteses

- **A — mensuração quebrada: REFUTADA.** A tag funciona; os 5 contatos provam.
- **B — problema pós-clique: PARCIAL.** Taxa de 0,9% (5/554). Baixa, mas existe.
- **C — reabertura degradou a entrega: CONFIRMADA, causa principal.** Com 0,9%,
  os 65 cliques pós-reabertura deveriam dar ~0,6 conversões. **Zero não é
  anomalia — é volume insuficiente.** A entrega caiu ~97%.

### 7.4 O que ainda não foi resolvido

A estratégia é **`TARGET_SPEND`**: otimiza para clique barato, **não** para
contato no WhatsApp. Os 5 contatos foram subproduto de volume.

**Não trocar para lance por conversão agora** — precisa de ~30 conversões/mês
para calibrar, e há 5. O caminho é acumular volume com clique barato primeiro.

### 7.5 Limiares

| Sinal | Leitura |
|---|---|
| CPC ~R$ 0,13 | regime bom; volume vem |
| CPC > R$ 1,00 | comprando clique caro — alertar |
| ~300 cliques sem contato | **investigar** (6,6% de ser acaso) |
| ~600 cliques sem contato | **defeito** (P ≈ 0,4%) |

### 7.6 Landing testada em 06/08 — APROVADA

Fecha a pendência do §6.1 e o passo 1 do §12.

| Item | Resultado |
|---|---|
| Carregamento | OK, HTTP 200 |
| HTTPS | OK na URL do anúncio |
| Redirecionamento | nenhum na URL do anúncio |
| Botão do WhatsApp | bolha flutuante 54×54 px, `fixed`, `z-index:70`, sempre no viewport |
| Número de destino | **5515991320687** (Viviane), idêntico nos 3 pontos de entrada |
| Mensagem pré-preenchida | correta |
| Tela do WhatsApp | aberta até **antes** do envio. Nada enviado. |
| `WHATSAPP - CÁSSIO` dispara 1× | **SIM, exatamente uma vez** |

Stack: GTM `GTM-5JGMZBKZ` · GA4 `G-8WNMS2XFXR` · Ads `AW-18088952203`.
Tag GA4 `__gaawe`, evento `whatsapp_click`, `once_per_event: true`, disparada por
`dataLayer.push` em `assets/site.js`. No clique de teste: `whatsapp_click` 1× ·
`pagead/conversion/18088952203/` 1× · `ccm/conversion/18088952203/` 1× ·
viewthrough 4× (remarketing, não é conversão).

> ⚠️ **Conversão de teste a descontar: 05/08/2026, 23:09:24–23:09:27 BRT.**
> Clique autorizado, com UTMs da campanha. Não contar como contato real.

**Dívida técnica achada:** os links `wa.me` são **injetados por JavaScript**. No
HTML do servidor são `href="#"` e a bolha flutuante não existe. Se o JS falhar,
os botões morrem e a conversão some sem rastro. Candidato mais plausível a
explicar clique que não vira contato. Correção proposta, não aplicada.

**Funil:** o CTA principal (`Consultar data e orçamento`, `Solicitar proposta`)
aponta para `#formulario`, não para o WhatsApp. O formulário tem 11 campos,
5 obrigatórios, com `input[type=date]`. `CASSIO | LEAD QUALIFICADO | FORM` está
**Inativo** — mas a cadeia parece íntegra (`site.js` empurra `form_submit`; o
container GTM referencia `form_submit` no mesmo padrão do `whatsapp_click`).
Hipótese principal: **ninguém completa o formulário**, não tag quebrada.
Não confirmado — exigiria submissão real, que geraria pedido à produção.

**NÃO VERIFICADO no teste:** viewport real de 390 px (rodou a 256×715, sem
emulação de UA mobile) · redirect HTTP → HTTPS (buscando `http://` o conteúdo
voltou em http, sem redirect visível — **checar manualmente**) · deep link no app
nativo · 1 dos 4 scripts do site não pôde ser lido.

### 7.7 Site corrigido em 07/08 — repositório `dadocruz/cassio-ferraz`

A dívida técnica acima virou correção. Três commits, todos na mesma família de
defeito: **link que nasce `href="#"` e só recebe destino se o JS rodar.**

| Commit | O quê |
|---|---|
| `90f7509` | 45 links de WhatsApp com `wa.me` real no HTML · CTA do hero vai ao WhatsApp em vez de `#formulario` · formulário de 5 campos obrigatórios para 2 (nome e telefone) |
| `64fcde6` | asteriscos removidos dos campos que deixaram de ser obrigatórios |
| `2d8cc6d` | 19 links de redes sociais do rodapé — mesmo defeito, mesma correção |

O JS continua rodando; agora ele apenas confirma um `href` que já está certo.
É a diferença entre o JS **ser** o link e o JS **enfeitar** o link.

> ⚠️ **`2d8cc6d` está commitado localmente, não publicado.** O sandbox não tem
> chave SSH nem `CLOUDFLARE_API_TOKEN`; `git push` e `npx wrangler deploy` rodam
> na máquina do dono. Os dois primeiros commits **já estão no ar** e verificados
> na URL do anúncio.

Deploy do site é **manual, sem CI** — `npx wrangler deploy`, Worker com assets
estáticos (`wrangler.jsonc`, `assets.directory: "."`, protegido por
`.assetsignore` que exclui `.git`). Publicar não é consequência de commitar.

---

## 8. GAVETA / BUTECO SERTANEJO — NÃO MEXER

Campanha `24105770570` — `DG | Buteco Sertanejo | Shorts | Spotify`

- `ENABLED` mas **`NOT_ELIGIBLE`**
- Ad `819900433355` → **`DISAPPROVED`**, política **`COPYRIGHTED_CONTENT`**,
  severidade **`FULLY_LIMITED`** (bloqueio total)
- Entrega: **0 impressões / 0 cliques / R$ 0,00**

**Não é falha de segmentação nem de orçamento.** A campanha nunca teve
oportunidade de veicular.

**Instrução vigente do dono: não mexer.** Não contestar, não editar, não
substituir vídeo.

Antes de contestar seria preciso ter: autorização do fonograma, da obra, do
vídeo, licença **para mídia paga** e procuração de agência. E **a conta é
compartilhada** — reprovação repetida por direitos autorais afeta Cássio, Garbo
e NovaCena junto.

Campanha antiga `24079586567` = `removed_by_owner`. Não reativar — o
`write-adapter` recusa em código.

---

## 9. MONITORAMENTO — `MONITOR_NOT_DEPLOYED`

```bash
node --import tsx scripts/google-ads-monitor.mts
```

Somente leitura, nenhum mutate. Alerta em: CPC > R$ 1,00 · gasto acumulado >
R$ 400 · mais de R$ 100 num dia sem contato novo. Grava em
`audit/google-ads-monitor.jsonl`.

**Verificado em 05/08: o script roda e produz saída correta.** Mas:

- `launchctl list` → nada deste projeto
- `crontab -l` → vazio
- `.github/workflows/` → só `ci.yml`, **nenhum `schedule:`**
- `audit/google-ads-monitor.jsonl` → **2 linhas**, ambas execução manual

O agendamento anterior era de sessão — sem PID, sem serviço, morto ao fechar a
conversa. **O script funciona; nada o chama sozinho.** Enquanto isso a campanha
gasta dinheiro real sem vigilância.

Para tornar real: `launchd` no Mac, cron na VPS, ou GitHub Actions agendado
(o repositório já tem CI; o developer token iria para Actions secrets).
**Provar com PID, serviço ou registro de execução** — não declarar pronto.

### 9.0 RESOLVIDO em 06/08 — o monitor está no ar

`MONITOR_NOT_DEPLOYED` **encerrado**. Execução #2 do workflow "Monitor de campanhas",
manual, na `main`, **Success em 35s**, autenticada pela conta de serviço via Actions
secrets. Saída real:

```
=== Cássio Ferraz — campanha 24066140634 ===
status: ENABLED / ELIGIBLE   orçamento: R$ 472.94

  2026-08-01 | R$ 1.37 |  0 cliques | CPC   -  | WhatsApp 0
  2026-08-02 | R$ 8.01 |  2 cliques | CPC 4.00 | WhatsApp 0
  2026-08-03 | R$ 8.04 |  4 cliques | CPC 2.01 | WhatsApp 0
  2026-08-04 | R$ 7.58 | 59 cliques | CPC 0.13 | WhatsApp 0
  2026-08-05 | R$ 4.55 | 38 cliques | CPC 0.12 | WhatsApp 0

7 dias: R$ 29.56 | 103 cliques | 0 contatos
Sem alertas.
```

O cron de 09:00/21:00 UTC passa a valer sozinho a partir daqui.

**Bug encontrado na primeira execução real e corrigido no mesmo dia.**
O script somava só a janela de 7 dias e comparava esse total contra o teto
**vitalício**: imprimiu `restante até o teto: R$ 443,38` quando o gasto acumulado
já era R$ 177,47 e o restante verdadeiro, ~R$ 295. Pior que o número errado:
o alerta de `gasto acumulado > R$ 400` comparava janela curta com teto longo e
**nunca dispararia**. O monitor vigiava com o alarme de verba surdo.

Corrigido com uma segunda consulta usando `campaign.start_date` — campo que só
existe até a v22, mais um motivo para a versão estar fixada (§5.1). A saída agora
separa `7 dias` de `acumulado`, e se `start_date` vier vazio o próprio monitor
alerta que está cego em vez de imprimir número errado.

### 9.2 Cron provado e alvo corrigido — 07/08

Duas coisas foram fechadas aqui, e é importante que sejam lidas como duas.

**O cron roda sozinho.** As execuções **#4 (06:52)** e **#5 (19:44)** aparecem
como `Scheduled`, não `workflow_dispatch`, ambas verdes. É essa a prova de que
o agendamento existe fora da sessão — o que a §9 exigia e que nenhuma execução
manual jamais demonstraria.

**Mas a #5 rodou em código velho.** Ela executou no commit `f3acb64`, anterior
ao merge da correção, então ainda vigiava a **24066140634 — que está pausada**.
Um workflow verde vigiando a campanha errada é pior que workflow vermelho:
"Sem alertas" descrevia com precisão uma campanha morta.

Execução **#6**, no merge `62e3617`, fecha a lacuna:

```
=== Cássio Ferraz — CASSIO | DEMAND_GEN | VIDEO_DVD | CONTRATANTES | DIARIO (24106867845) ===
status: ENABLED / LEARNING   orçamento: R$ 50.00/dia

  2026-08-06 | R$ 1.81 | 15 cliques | CPC 0.12 | WhatsApp 0

7 dias:     R$ 1.81 | 15 cliques | 0 contatos
acumulado:  R$ 1.94 | 16 cliques | 0 contatos (desde 2026-08-06)
CPC médio:  R$ 0.12   taxa de contato: 0.00% (0 em 16 cliques)

Sem alertas.
```

Nome, ID, orçamento diário e as duas métricas derivadas conferem.

**Regra que sai daqui:** ao corrigir o monitor, confira em qual commit a
execução rodou, não só se ela ficou verde. O `schedule` usa a `main` no momento
do disparo; enquanto a correção está em branch, o cron segue rodando o código
antigo sem nenhum sinal disso na interface.

### 9.1 Os dois bloqueios que existiam (histórico)

O `.github/workflows/monitor.yml` existe e está bem escrito, mas **não roda**, e
o motivo não é só o que estava registrado aqui.

**Bloqueio A — o workflow não está na branch padrão.**
`monitor.yml` existe apenas em `feat/google-ads-live-operations-v1`. A `main`
(HEAD `d91a670`, branch padrão) só tem `ci.yml`. O GitHub **só registra
`schedule` e `workflow_dispatch` de arquivos presentes na branch padrão** —
confirmado na aba Actions: a barra lateral lista apenas **CI**, e "Monitor de
campanhas" não aparece. Portanto o cron das 09:00/21:00 UTC nunca disparou e não
há como disparar à mão.
*Saída sugerida, sem mesclar o PR #2:* PR pequeno e dedicado levando **somente**
`.github/workflows/monitor.yml` para a `main`.

**Bloqueio B — os secrets não estão cadastrados.**
Em `Settings → Secrets and variables → Actions`, em 06/08:
`Repository secrets: This repository has no secrets.` e
`Environment secrets: This environment has no secrets.`
Nem `GOOGLE_ADS_DEVELOPER_TOKEN` nem `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` existem.
O dono relatou tê-los cadastrado; **a verificação contradiz o relato**. Registrado
como `owner_reported` × `verified` em conflito — vale `conflicting`.
Passo a passo: `docs/runbooks/ativar-monitor.md`.

**Ordem correta:** B depois A, ou o primeiro `workflow_dispatch` falha no passo
"Preparar credencial". Os dois são necessários; nenhum é suficiente sozinho.

---

## 10. RESTO DA OPERAÇÃO

### 10.1 VPS `nvvps` — Debian 11, Docker Swarm, 13 stacks, 28 serviços

**Reverificado em 06/08 por SSH.** Levantamento completo e sanitizado em
`docs/discovery/vps-inventory-2026-08-06.md`. O quadro abaixo substitui o
anterior — três itens mudaram de leitura.

| ID | Sev | Estado em 06/08 |
|---|---|---|
| V-001 | crítico | **aberto** — Debian 11 no fim do LTS (agosto/2026); 194 dias sem reboot |
| R-001 | crítico | **parcialmente fechado em 06/08** — scripts instalados em `/root/backup-scripts/` na VPS. `backup-volumes.sh --apply`: **10/10 volumes**, integridade verificada por checksum. `backup-postgres.sh --apply`: **7 bases em 3 containers**, integridade verificada, incluindo `encantaria/directus` — que antes vinha vazio (usuário errado no script). Destino em `/var/backups/control-plane`, fora do `/tmp` que o `systemd-tmpfiles-clean` varre. **Falta o upload externo**: a cópia existe e é íntegra, mas mora no mesmo disco que deveria proteger — cobre volume corrompido ou apagado por engano, não cobre perder a VPS. O dump de `encantaria/directus` deu **82 KB**, número pequeno demais para passar sem conferência — foi exatamente esse tipo de número pequeno que escondeu o backup vazio por meses; vale checar o conteúdo antes de confiar |
| R-002 | ~~crítico~~ → médio | **reformulado** — a hipótese de "arquiva o checkout do Git" **não se confirmou**: o script aponta para `data/` e `uploads/`, que são dados de aplicação. A discrepância 791 MB × 2,3 GB **segue sem explicação**. `requires_verification` |
| R-003 | crítico | **pior que o registrado** — não é regra frouxa, é **ausência de filtro**: `-P INPUT ACCEPT` e **nenhuma regra em INPUT**. 2377, 7946, 4789 e 3000 abertas sem filtro |
| R-004 | alto | **confirmado** — `novacena-env-production.backup.20260521152109` em `/root`. Não aberto |
| R-005 | resolvido | Swap era **zero** com 28 serviços. 2 GB criados em 06/08 |
| R-006 | resolvido | `prune -af` diário apagaria imagem local sem registry. Trocado por `--filter until=720h`. O log prova que **nunca chegou a apagar nada** (233 KB, tudo `0B`) |

**O backup é real, externo e funciona** — 6 execuções consecutivas com sucesso de
31/07 a 05/08, para bucket S3 de verdade, credencial fora do script. A hipótese
de "cópia no mesmo disco via MinIO local" está **descartada**. O problema não é
o backup falhar; é ele cobrir um treze avos do que precisa cobrir.

**Não instalar `ufw` nesta VPS.** Em host com Docker ele não se aplica a portas
publicadas por container e cria falsa proteção; `iptables` direto num nó Swarm é
pior, porque o Docker reescreve as próprias cadeias. O lugar do filtro é o
**firewall do painel da Hostinger**, fora do host.

**`scripts/backup/` — instalados em `/root/backup-scripts/` na VPS em 06/08**,
executados e verificados (ver R-001).

`scripts/restore/` — prontos e testados, **não instalados**. O restore nunca foi
exercitado contra um dump real; integridade de checksum não é restaurabilidade.

`scripts/docker-retention-*.sh` — prontos, **não instalados**.

### 10.2 WhatsApp / Evolution API — homologação

`packages/integrations/src/evolution/` · `writeActionsEnabled = false` fixo em
código (literal de tipo, não variável) · número real **não conectado**.

Defesas testadas: HMAC em tempo constante · allowlist · rate limit ·
deduplicação · descarte de `fromMe` (**prevenção de loop** — a Evolution reenvia
as próprias mensagens) · descarte de grupo e broadcast · resposta 413 sem matar
o socket antes de responder.

**`REAL_PAYLOAD_VERIFIED = false`** — o formato veio da documentação, não de
amostra real. `x-webhook-signature` é **convenção deste projeto**, não recurso
da Evolution. Antes de conectar: capturar payload real e confirmar.

### 10.3 Bloqueios pendentes

- **n8n** — sem API key. **Maior ponto cego:** 13 stacks e ninguém sabe o que os
  workflows fazem.
- **Cloudflare** — sem token. Falta o mapa domínio → cliente.
- **Conector do Drive** — conta indeterminada, viola a separação Google.

### 10.4 Segurança pendente

1. **TOTP de `contato.automatizadoria@gmail.com`** exposto em captura de tela —
   registrado em `clients/vivere/security.yaml`, **não rotacionado**.
2. `~/Downloads/credentials.json` — chave S3 com permissão `644`.
3. O developer token foi exposto em chat e **rotacionado pelo dono** em 05/08.

---

## 11. ONDE ESTÁ CADA COISA

```
clients/<slug>/profile.yaml     contexto do cliente
clients/<slug>/campaigns.yaml   histórico + snapshot ao vivo
inventory/*.yaml                13 arquivos de fatos com procedência
docs/discovery/                 levantamentos datados
docs/operations/                planos e políticas
docs/runbooks/                  procedimentos
docs/adr/                       decisões arquiteturais
brain/                          julgamento e critério
STATUS.md  TASKS.md  DECISIONS.md
```

**Clientes:** `automatizadoria` · `cassio-ferraz` · `chapeu-de-bruxa` ·
`garbo-eventos` · `gaveta-producoes` · `novacena` · `soulraizes` · `vivere`.
O `slug` é a chave canônica, em `clients/index.yaml`.

**Caminho inverso** (achei um recurso, de quem é?): `inventory/repositories.yaml`,
`domains.yaml` ou `services.yaml` — cada entrada aponta `likelyClient`.

### `verificationStatus` — obrigatório em todo dado

`live_api` · `historical_manual` · `user_reported` · `owner_reported` ·
`discovered` · `verified` · `conflicting` · `stale` · `unknown` ·
`requires_verification`

**Inferência nunca vira `verified`.** Se a associação não for certa, registre
`unknown` e pergunte.

### Leitura essencial

`CLAUDE.md` · `STATUS.md` · `DECISIONS.md` ·
`docs/discovery/google-ads-post-op-audit-2026-08-05.md` ·
`docs/operations/cassio-campaign-recovery-plan.md` ·
`docs/operations/gaveta-buteco-copyright-status.md`

---

## 11-B. PLATAFORMA DE AGENTE — o alvo

O dono pediu um agente comandado por WhatsApp que executa ação nas contas dos
clientes, mais uma página de configuração, apoiado num banco na VPS.

**Desenho completo: `docs/architecture/agent-platform.md`.** Leia antes de
mexer em `packages/agent/`.

Princípio que organiza tudo: **o modelo não chama API, escolhe entre ações
declaradas.** Registrar no `ActionRegistry` é decisão de engenharia; expor no
`CapabilityCatalog` é decisão de operação. As duas não acontecem pelo mesmo
gesto.

### O que já está pronto e testado

| Peça | Arquivo |
|---|---|
| Resolvedor de cliente — recusa ambiguidade | `packages/agent/src/client-resolver.ts` |
| Confirmação por código derivado do plano | `packages/agent/src/confirmation.ts` |
| Catálogo de capacidades com escala de risco | `packages/agent/src/capability.ts` |

52 testes em `tests/agent/`.

O código de confirmação é **prefixo do SHA-256 do plano**, não sorteado: se o
valor, a campanha ou o cliente mudarem entre planejar e confirmar, ele deixa de
bater e a execução é recusada sozinha.

### Fases

| # | Fase | Estado |
|---|---|---|
| 0 | Destravar (v22, credencial por caminho) | ✅ |
| 1 | Tornar contínuo (monitor agendado) | ✅ **06/08** — secrets cadastrados, PR #2 mesclado, workflow rodou com Success. Ver §9.0 |
| 2 | Banco na VPS | ✗ |
| 3 | WhatsApp somente leitura | ✗ |
| 4 | Escrita com confirmação | ✗ |
| 5 | Página web | ✗ |
| 6 | Executores (GitHub, deploy, SaaS) | ✗ |

**Não pule a fase 3.** É onde se descobre, sem risco financeiro, se o agente
confunde Garbo com Gaveta.

---

## 12. PRÓXIMOS PASSOS

### Nesta ordem

**0. ~~Destravar o monitor.~~ ✅ FEITO em 06/08 — ver §9.0.** Secrets cadastrados,
PR #2 mesclado, workflow rodou com Success, cron ativo. Sobrou uma verificação:
confirmar na próxima execução que o gasto acumulado aparece correto (~R$ 177 e não
~R$ 30) depois da correção do bug de janela.

**1. ~~Testar a landing do Cássio.~~ ✅ FEITO em 06/08 — ver §7.6.** Aprovada.
Campanha não foi pausada. Restam três pendências menores dali: conferir
manualmente o redirect HTTP → HTTPS, decidir sobre o formulário de 11 campos, e
decidir sobre os links `wa.me` injetados por JS. Nenhuma bloqueia a operação.

**2. ~~Tornar o monitor persistente.~~ ✅ PROVADO em 07/08 — ver §9.2.**
Execuções #4 e #5 vieram marcadas como `Scheduled`. #6, no merge `62e3617`, já
reporta a campanha certa.

**3. Acompanhar CPC e contatos** pelos limiares da seção 7.5.

**4. Publicar `2d8cc6d` no site do Cássio** — ver §7.7. Único item do Cássio em
aberto. Na máquina do dono, dentro de `~/Projetos/cassio-ferraz`:

```bash
git push origin main
npx wrangler deploy
```

**5. ~~Garbo e NovaCena no `scope.ts`.~~ ✅ FEITO em 07/08.** Sete campanhas
entraram como `read_only_scope` — lifecycle novo: o leitor alcança, o escritor
recusa. Ver `docs/operations/padrao-medicao-por-cliente.md`.

> **Achado que muda a leitura:** as **cinco** campanhas da Garbo estão
> **pausadas**, quatro delas `Limitada pelo orçamento` com R$ 3 a R$ 12/dia. As
> duas da NovaCena também. O total diário da conta é R$ 50 — que é só o Cássio.
> A coluna `WhatsApp | GARBO` vai marcar zero, e esse zero significa **"não
> rodou"**, não "rodou e não converteu". Antes de discutir anúncio da Garbo,
> decidir sobre verba.

**6. Próximo cliente.** Falta tag de WhatsApp para Sou Raízes, Chapéu de Bruxa e
Encantaria, e o pixel da Meta em todos. Os dois primeiros seguem bloqueados por
não terem site; Encantaria depende de achar onde mora o conteúdo (§10.3).

### Curto prazo

Resolver R-002 (confirmar as montagens do `novacena-motion`) · rotacionar o
TOTP · gerar API key do n8n e token da Cloudflare · fechar o PR #2.

### Não fazer agora

Trocar a estratégia de lance do Cássio (dados insuficientes) · mexer no Buteco
(instrução do dono) · conectar WhatsApp real (payload não homologado) · subir a
versão da API além da v22 (campos de data) · mesclar o PR #2 sem revisão ·
abrir integração nova antes de o monitor existir.

### Restrição vigente do dono

> Não faça nova otimização. Não altere público, criativo, lance, orçamento,
> datas ou status. Não toque em nenhuma outra campanha.

Vale até nova autorização explícita. A correção da versão da API (v21 → v22)
foi feita sob esta restrição por ser **conserto de integração quebrada**, não
otimização: nenhum parâmetro de campanha foi tocado, e a única chamada de
escrita foi `validateOnly` com valor idêntico ao atual.

---

## 12-B. GARBO NO AR — 07/08, e o modelo pré-pago

**As campanhas da Garbo nunca foram ruins. Elas estavam sem verba.** De 10/07 a
06/08, com R$ 3 a R$ 12/dia, produziram **29 conversas de WhatsApp por R$ 221,60**
— R$ 7,64 por conversa, 145 cliques, CPC médio R$ 1,53.

Reativadas em 07/08 com os R$ 100 da Andréia, rateados pelas conversas geradas:

| Campanha | ID | Conversas | Orçamento |
|---|---|---|---|
| MOVEIS EVENTOS | 24016194642 | 11 | R$ 6,00/dia |
| MESAS CADEIRAS | 24016194645 | 10 | R$ 5,00/dia |
| PRODUTOS ESPECIFICOS | 24016194648 | 6 | R$ 3,00/dia |
| CASAMENTOS EVENTOS | 24016194654 | 2 | pausada |
| MARCA | 24016194651 | 0 | pausada |

R$ 14/dia × 7 dias ≈ R$ 98. Total da conta subiu de R$ 50 para R$ 64/dia.

> **A proporção premia volume, não eficiência.** `PRODUTOS ESPECIFICOS` entrega
> conversa a R$ 2,36 e `MOVEIS EVENTOS` a R$ 11,07 — quase 5× mais caro. Se a
> meta virar custo por conversa, a ordem se inverte. Rever no próximo depósito.

**O achado estrutural:** fundos disponíveis são **R$ 685,44 num único bolso**.
Google Ads não tem carteira por campanha — o clique da Garbo pode ser pago com
o dinheiro do Cássio, e não há trava possível na plataforma. A separação por
cliente é **contábil**, não estrutural. Rateio declarado pelo dono: Gaveta
R$ 300, Garbo R$ 100, Cássio R$ 285,44 — registrado em
`inventory/saldo-por-cliente.yaml`.

Protocolo completo em `docs/operations/protocolo-campanha-pre-paga.md`. Dois
pontos que valem repetir aqui:

- **"Perde o aprendizado" tem endereço.** As 5 da Garbo são CPC manual — não há
  modelo de lance a perder. Quem tem aprendizado caro é `VENDAS - NOVACENA`
  (Maximizar conversões). Antes de pausar, olhe o tipo de lance.
- **Piso em vez de pausa.** Saldo acabou, orçamento cai para R$ 1,00/dia e a
  campanha fica no ar. Custa até ~R$ 30/mês por cliente parado, do bolso do
  dono. É float deliberado, não descuido.

**Gaveta segue parado.** Os R$ 300 estão reservados mas o anúncio 819900433355
continua reprovado por COPYRIGHTED_CONTENT. O dono vai enviar mídia nova para
substituir o short. Não gastar antes da troca.

**Lacuna aberta:** o monitor só vigia o Cássio. A Garbo está no ar e sem
vigilância, e não há alerta de saldo por cliente. É o próximo passo.

---

## 13. SITUAÇÃO ATUAL

**`CASSIO_DELIVERING`** — há entrega, sem contato novo confirmado desde a
reativação. **Reconfirmado em 06/08:** os 5 contatos continuam sendo os de 29/07
(§7.2). A interface mostrava 680 cliques e R$ 177,47 acumulados, CPC ~R$ 0,26 —
leitura de interface, não de API.

Só reporte **`CASSIO_CONVERTING`** após novo `WHATSAPP - CÁSSIO` confirmado
**pela API**, não pela interface.

**Estado de configuração em 06/08:** `WHATSAPP - CÁSSIO` está em **Ação
secundária** — ou seja, `metrics.conversions` continua devolvendo 0 e
`metrics.all_conversions` devolve 5. Isso é o esperado e deliberado. **O monitor
precisa ler `all_conversions` segmentado por ação, nunca `conversions`.**
(Já lê — ver `scripts/google-ads-monitor.mts`.)

**Leitura da API em 06/08, pelo monitor:** 103 cliques em 7 dias, **0 contatos
novos**. Os 5 continuam sendo os de 29/07. Com p=0,9%, zero em 103 tem ~39% de
chance de ser acaso — muito abaixo do limiar de investigação de 300 (§7.5).
CPC em R$ 0,12–0,13 nos dias de volume: regime bom.

**A conversão de teste de 05/08 23:09 NÃO apareceu** na leitura da API para
aquele dia. Hipótese principal, ainda não confirmada: o teste navegou direto
para a URL, **sem `gclid`** — sem ele o Ads não atribui a conversão à campanha.
Se estiver certo, o teste provou que a tag dispara **sem sujar o dado da
campanha**. Conferir na próxima leitura antes de dar como encerrado.
