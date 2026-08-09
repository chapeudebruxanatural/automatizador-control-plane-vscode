

## ▶︎ RETOMADA — Meta com leitura real e acesso operacional em 09/08/2026

Com autorização explícita do dono, o usuário do sistema **Automatizadoria** (ID `61593000755608`) recebeu **Acesso total** à conta de anúncios **ADM 01**. A própria interface da Meta confirmou que esse nível inclui campanhas, configurações, finanças e permissões da conta. O app dedicado permanece **AutomatizadorIA Control Plane** (ID `1046773687948340`) no portfólio **Dado Cruz** (ID `488135221601055`).

O token substituto de 60 dias permanece no GitHub Actions secret `META_ACCESS_TOKEN`. Ele foi criado com `ads_read` e `business_management`; **não declarar capacidade de escrita**, porque `ads_management` não fazia parte desse token. A elevação do ativo não altera os escopos já emitidos. A futura rotação para `ads_management` é uma operação de credencial separada e deve ocorrer somente quando o adaptador de escrita estiver protegido pelo mesmo plano, hash, aprovação consumível, auditoria e kill switch usados no Google Ads.

A leitura real foi validada pelo workflow `.github/workflows/meta-readonly.yml`, execução **Validar leitura Meta #3** (GitHub Actions run `31326634164`): 1 conta acessível, **ADM 01**, ID verificado `act_1217584809532823`, status `1`, moeda `BRL`. O primeiro teste falhou com OAuthException código `2635` porque o endpoint não tinha versão explícita. A documentação oficial confirmou a Graph API **v26.0**, lançada em 29/07/2026; com `v26.0`, o mesmo teste ficou verde. Mensagem, corpo de erro e token não foram registrados.

Foram adicionados o cliente `packages/integrations/src/meta/client.ts`, o adaptador `packages/integrations/src/meta/adapter.ts` e `tests/meta-read.test.ts`. O cliente usa somente GET, envia o token apenas no cabeçalho, pagina por cursor sem seguir URL fornecida pela resposta e omite corpos potencialmente sensíveis dos erros. O adaptador real ainda **recusa escrita**. O CI remoto #77 ficou verde em Node 20.11 e 24; os 4 testes Meta, build e varredura de segredos também passaram localmente.

Próximos passos, em ordem: inventariar Páginas, Instagram, WhatsApp Business e pixels/datasets; registrar associações incertas como `verificationStatus: unknown`; integrar o adaptador de leitura à composição da API sem sobrescrever as mudanças locais pendentes; implementar plano de criação de campanha em modo dry-run; somente então rotacionar o token para incluir `ads_management` e testar escrita numa campanha explicitamente identificada. Não tocar no Buteco Sertanejo `24105770570` nem na campanha removida `24079586567`.
# HANDOFF — AutomatizadorIA Control Plane

> **Comece por `CONTINUAR-AQUI.md`.** Ele separa fato verificado de incerteza e
> traz a fila em ordem. Este documento é o registro completo; aquele é a porta
> de entrada.

Documento de transferência. **Atualizado 2026-08-09.** O estado mais recente
está no último bloco `▶︎ RETOMADA` da §13.

> **Branch de trabalho: `main`.** As duas feature branches históricas já foram
> mescladas. O `schedule` do GitHub Actions roda a partir da `main`; confira
> sempre o SHA efetivamente executado (§9.2).

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
| `main` | branch atual; use `git status --short --branch` para o SHA e diferenças locais |
| `feat/operational-stabilization-v1` | histórica, mesclada (PR #1) |
| `feat/google-ads-live-operations-v1` | histórica, mesclada (PR #2) |

**Continue na `main`.** Não trabalhe nas branches históricas.

---

## 2. VALIDAÇÃO DO AMBIENTE

Rode isto antes de qualquer coisa:

```bash
npm ci && npm run verify && npm run scan:secrets:all
```

Resultado esperado, verificado em 09/08:

| Comando | Estado | Observação |
|---|---|---|
| `npm run lint` | OK | ESLint |
| `npm run typecheck` | OK | `tsc --noEmit` |
| `npm test` | OK | **290 testes, 79 suítes, 17 arquivos, 0 falhas** |
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
    cloudflare/   client.ts  parser.ts       ← somente GET; API provada
apps/
  api/          server.ts  main.ts  routes/  ← webhook do WhatsApp
  worker/       main.ts
tests/          17 arquivos, 290 testes, 79 suítes
scripts/        17 arquivos
```

**Estado real de conexão** — o ponto estrutural mais importante:

| Integração | Estado |
|---|---|
| Google Ads | **ao vivo**, leitura e escrita, usada em produção |
| Evolution / WhatsApp | construída e testada, **número real não conectado** |
| n8n | UI autenticada: 30 workflows, 1 ativo; **sem API key** porque o plano não limita escopos a leitura |
| Cloudflare | **ao vivo, somente leitura**; 8 zonas/14 DNS/10 Pages/3 Workers, token fora do Git |
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
- **Dependência adicionada sem regenerar o `package-lock.json` (07/08).** O
  `yaml` entrou no `package.json` para o governador ler o livro-caixa. O
  workflow do monitor roda `npm ci`, que **recusa lock fora de sincronia** — a
  próxima execução agendada quebraria, e quebraria o monitor que tinha acabado
  de ser consertado e provado. Nenhum teste local acusaria: `npm test` usa o
  `node_modules` que já está lá. Regra: **mexeu em `package.json`, regenere o
  lock e valide com `npm ci` num diretório limpo**, não com `npm install`.
- **"Histórico vazio" que era histórico filtrado (07/08).** Concluí que o
  Histórico de Alterações do Google não registrava a pausa da Garbo. Registrava:
  a tela tinha herdado o filtro `Status da campanha: Ativadas` — **aplicado por
  mim minutos antes**, ao conferir o que estava no ar. Campanha pausada não
  aparece nesse filtro, e os eventos procurados eram justamente de campanhas
  pausadas. Isso me levou a escrever "autor desconhecido" e a listar acesso de
  terceiro como hipótese, quando a causa era um script legado da própria conta.
  **Regra: antes de concluir que um dado não existe, cheque o instrumento.**
  Ausência de resultado e filtro errado produzem a mesma tela — a mesma família
  do bug de "saldo intacto" versus "campanha parada" corrigido no mesmo dia.
- **Primeira coleta de ID de campanha por inferência (07/08).** Os IDs da Garbo
  foram deduzidos por proximidade no HTML da interface; **três dos cinco nomes
  saíram errados**. Não foram gravados. O `href` de cada linha é a fonte; a
  coluna `ID da campanha` da própria tabela confirma. Ver `scope.ts`.

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
| 2 | Projeção do control plane no banco existente | ✗ integração; infraestrutura existe segundo o dono |
| 3 | WhatsApp somente leitura | ✗ |
| 4 | Escrita com confirmação | ✗ |
| 5 | Integrar o painel web existente | ✗ integração; painel existe segundo o dono |
| 6 | Executores (GitHub, deploy, SaaS) | ✗ adaptadores; plataformas já existem |

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

**~~Lacuna aberta:~~ ✅ FECHADA no mesmo dia.** O governador de orçamento entrou
no agendador — ver §12-C.

---

## 12-C. GOVERNADOR DE ORÇAMENTO — no ar em 07/08

Resposta ao pedido do dono: *"um sistema que impeça um cliente de gastar o saldo
de outro"*.

**Não impede. Nenhum software impede.** O Google decide o gasto, não nós, e
numa conta compartilhada não há carteira por campanha. O que existe é teto de
orçamento diário mais detecção rápida. Impedir de verdade só com contas
separadas por cliente — que o dono tem motivo real para não fazer: o bônus do
Google é maior concentrando volume numa conta só. É uma troca consciente:
**isolamento por bônus**.

`packages/integrations/src/google-ads/budget-governor.ts` (função pura, sem I/O)
· `scripts/governador-orcamento.mts` (somente leitura) · roda no `monitor.yml`
às 09:00 e 21:00 UTC, logo após o monitor.

### As duas margens que a intuição erra

**1. O teto seguro é `restante ÷ 2`, não `restante`.** O Google gasta até 2× o
orçamento diário num dia isolado e compensa no mês — mas o saldo do cliente já
foi. Com R$ 10 sobrando, R$ 10/dia pode virar R$ 20 gastos.

**2. Desconta o gasto ainda não reportado.** Entre duas execuções há consumo
real e invisível. Tratar o número do relatório como verdade subestima o gasto
justamente quando a margem é menor. Há teste de um caso que passa de `atencao`
para `critico` só por causa disso.

Ambas erram para o lado de parar cedo. Parar cedo custa horas de veiculação;
parar tarde custa o dinheiro de outro cliente.

### Como ele se comporta

| Nível | Quando | Ação |
|---|---|---|
| `saudavel` | 3+ dias | nada |
| `atencao` | 1 a 3 dias | avisa. **Não mexe em orçamento** — mudar pode reiniciar aprendizado e ainda há folga |
| `critico` | < 1 dia | recomenda reduzir ao teto seguro |
| `estourado` | gasto > depositado | recomenda o piso e diz **quanto já saiu da fatia de outro** |

**Nunca recomenda aumento.** Há teste varrendo combinações de gasto e atraso.
Governador que sobe orçamento sozinho deixa de ser freio e vira acelerador.

**Não aplica nada.** Imprime o comando; aplicar passa pelo `planCampaignBudget`
com hash de aprovação. Decisão do dono: *"me avise antes, me dê a sugestão
correta para eu decidir, e aí aplique."*

Sai com código `3` quando há decisão pendente, `0` quando não há. O passo tem
`continue-on-error` porque 3 é informação, não falha — workflow que fica
vermelho por rotina é workflow que ninguém lê.

### Contabilidade: três números, não um

`inventory/saldo-por-cliente.yaml`. O Pix do cliente chega ao dono, que retém a
comissão de gestão e deposita o resto no Google:

```
recebidoDoCliente = comissao + depositadoEmAds
```

**Só `depositadoEmAds` dá pista de veiculação.** Lançar o Pix inteiro como saldo
de anúncio infla os dias calculados: o governador acha que o cliente tem mais
pista do que tem e o deixa consumir a fatia de outro **reportando tudo verde**.
O número inflado não engana só o cliente; engana o freio.

`conciliarCaixa()` fecha a conta: `depositado + bônus − gasto` tem que bater com
o saldo real do Google. Bônus promocional tem linha própria porque não pertence
a cliente nenhum — subsidia quem estiver veiculando. Sem linha própria viraria
divergência inexplicável todo mês, e divergência que sempre aparece é
divergência que ninguém olha.

### Primeira leitura real — 07/08, execução no Actions

```
fundos na conta:      R$ 685,44
prometido a clientes: R$ 384,71     (sem descoberto)

  GARBO-EVENTOS  [saudavel]  depositado R$ 100,00 · gasto R$ 0,00 · 6,1 dias
  CASSIO-FERRAZ  [saudavel]  depositado R$ 285,44 · gasto R$ 0,73 · 4,7 dias

! COMISSAO NAO DECLARADA: garbo-eventos (2026-08-07)
```

Os números conferem com a fórmula: Garbo `(100 − 14) ÷ 14 = 6,1`; Cássio
`(285,44 − 0,73 − 50) ÷ 50 = 4,7`. Os descontos de 12h estão sendo aplicados.

**Duas coisas para olhar amanhã, e elas não são iguais:**

- **Garbo com gasto R$ 0,00.** Ativada em 07/08; zero no mesmo dia é plausível.
  **Zero de novo amanhã não é** — aí investigar anúncio reprovado, grupo de
  anúncios pausado ou lance abaixo do leilão.
- **Cássio com R$ 0,73 num orçamento de R$ 50/dia.** É 1,5% do orçamento. A
  campanha está em LEARNING desde 06/08 e vinha de R$ 1,90 acumulados. Ou ela
  destrava, ou o problema não é verba.

---

## 13. SITUAÇÃO ATUAL

### Avaliação de arquitetura — OpenClaw é opcional (08/08)

O OpenClaw pode substituir a camada genérica que ainda não está pronta neste
repositório: canal do WhatsApp, pareamento/allowlist, sessões, roteamento de
agentes, automações e encaminhamento de aprovações. Ele **não substitui** o
domínio da AutomatizadorIA: resolução inequívoca de cliente, escopo de conta e
campanha, livro-caixa, governador, campanhas congeladas, aprovação vinculada ao
plano e auditoria.

O dono informou que já possui banco, painel web, GitHub, VPS, Cloudflare, n8n,
Meta e a infraestrutura de WhatsApp. Trate a existência completa desse conjunto
como `owner_reported` até cada recurso ser inventariado; VPS, Postgres, n8n e
Evolution já têm evidência parcial ou direta no inventário. O que falta não é
recriar essas plataformas, mas ligá-las ao `ActionRegistry`, ao kill switch, à
aprovação e à auditoria.

**Recomendação atual: não instalar OpenClaw agora.** O caminho mais curto usa a
estrutura existente: `WhatsApp/Evolution → n8n → API do control plane →
adaptadores`. O painel existente chama a mesma API. OpenClaw só volta à mesa se
sessões multiagente, memória ou outros canais justificarem uma camada adicional.

Estimativa revisada, se as credenciais e APIs existentes forem disponibilizadas
por referência segura: 3 dias úteis para WhatsApp somente leitura, 7 a 10 para
Google Ads com confirmação e piloto, e 10 a 15 para integrar banco, painel e os
adaptadores prioritários já existentes. Nenhuma instalação, dependência ou
escrita na VPS foi feita nesta avaliação.

### Pacote de desbloqueio aguardado do dono (operação completa)

Para reduzir o caminho crítico, o dono precisa fornecer **identificadores e
referências de credenciais, nunca os valores dos segredos no chat ou no
repositório**:

1. mapa autoritativo cliente → Google Ads/Meta/WhatsApp/banco, com a fonte da
   confirmação; associação incerta permanece `verificationStatus: unknown`;
2. IDs de conta gerenciadora/cliente e referência segura do developer token e
   OAuth do Google Ads;
3. IDs de Business Manager, contas de anúncios, páginas e Instagram da Meta,
   permissões desejadas e referência segura do token de System User/app;
4. URL, nome da instância, número pareado, destinatário de teste e referência
   segura da API key do Evolution, além de uma carga real sanitizada do webhook;
5. URL do n8n, workflows atuais, referência segura da API key e processo de
   promoção entre homologação e produção;
6. esquema/migrations e mecanismo de acesso ao banco existente, com usuário de
   homologação e política de backup/rollback;
7. repositório/caminho, autenticação, URL e processo de deploy do painel web;
8. host e usuário restrito da VPS, diretório/serviço alvo, runtime, gerenciador
   de processo e localização dos logs — sem enviar chave privada;
9. IDs de conta/zonas/rotas da Cloudflare e referência de token de escopo
   mínimo; organização/repositórios GitHub e método de acesso correspondente;
10. matriz de autorização: números permitidos, aprovadores, ações somente
    leitura, ações mutáveis, limites de orçamento, horários e frase de pânico;
11. um cliente/conta/recurso de homologação e exemplos do resultado esperado
    para consultas, alertas, aprovações e relatórios.

Cada escrita externa continuará exigindo plano exato e aprovação: cadastrar
segredos, alterar VPS/n8n/Cloudflare/banco, conectar webhook/número, publicar ou
enviar mensagem. O fornecimento desse pacote não é aprovação geral para essas
ações.

> ## ✅ INCIDENTE FECHADO — script legado pausou a Garbo (verificado em 08/08)
>
> A primeira leitura do Histórico de Alterações parecia vazia porque a visão
> herdou o filtro `Status da campanha: Ativadas`. Ao trocar para `Todas` (78
> campanhas), apareceram os eventos que fecham o incidente.
>
> Em 07/08 às 14:25:55, `contato.automatizadoria@gmail.com` ativou manualmente
> as três campanhas. Às 14:49:19, a ferramenta **`Script do Google Ads`**, sob
> a mesma conta, mudou exatamente 24016194642, 24016194645 e 24016194648 de
> ativa para pausada. Houve o mesmo ciclo às 01:27:05/01:49:19.
>
> O Histórico de scripts identifica a origem: **`GARBO | TRAVA R$100 |
> 20260728`**, ID interno `11999683`, agendado de hora em hora. Na execução das
> 14:49:15 ele concluiu três ações; quatro segundos depois o histórico registrou
> as pausas.
>
> A causa está no código do próprio script: `START_DATE = 20260728`, teto de
> R$ 100 e pausa preventiva em R$ 90. O depósito novo de 07/08 não atualizou
> essa janela antes da reativação. Como o gasto desde 28/07 já superava R$ 90,
> toda campanha ativa era pausada na execução horária seguinte.
>
> **Conclusão:** não é problema de acesso nem ação de terceiro; é conflito entre
> uma trava legada e a nova operação/governador.
>
> Com aprovação explícita do dono em 08/08, a frequência do script `11999683`
> foi alterada de `Por hora` para `Nenhuma`: a tabela agora mostra `—`. O script
> continua existente, com código intacto e status `Ativado`; não foi apagado nem
> executado manualmente.
>
> Depois da neutralização, foram reativadas **somente** 24016194642,
> 24016194645 e 24016194648. Recarregamento confirmou `Ativado` e orçamentos
> inalterados de R$ 6/dia, R$ 5/dia e R$ 3/dia. MARCA (24016194651) e
> CASAMENTOS (24016194654) continuam pausadas. Buteco 24105770570 e Gaveta
> 24079586567 não foram tocadas.
>
> Medição do lote novo da Garbo: `WhatsApp | GARBO` ficou em **0 em 07/08 e 0
> em 08/08 até 09:04**. Isso soma 0 desde o crédito de R$ 100 da Andréia; o
> histórico anterior de 29 conversas não pertence ao lote novo.

> ## ▶︎ RETOMADA — operação atualizada em 08/08/2026 às 09:04
>
> Branch `main`, árvore limpa antes da documentação. Validação local completa:
> `npm ci`, lint, typecheck, **256 testes em 70 suítes**, build e varredura de
> 182 arquivos por segredos — tudo verde, zero achados.
>
> **Comece por estes três, nesta ordem:**
>
> **1. Às 09:50 ou depois, reconferir somente por leitura** que o script não
> executou na antiga janela das 09:49 e que as três campanhas seguem ativas.
> A frequência já aparece como `Nenhuma`, mas essa verificação fecha a
> estabilidade operacional sem depender de inferência.
>
> **2. Medir entrega da Garbo.** O R$ 0,00 de 07/08 está explicado
> pela pausa. Investigar anúncio/lance apenas se seguir zerada depois de 24h
> contínuas realmente ativa.
>
> **3. Cássio:** consolidado em 08/08 às 09:18 usando o XML exportado às 09:12
> (`Todo o período`, cinco campanhas) e o relatório de Locais ao vivo: **1.388
> cliques de anúncio, R$ 373,63 gastos, 14 em `WHATSAPP - CÁSSIO`, R$ 26,69 por
> WhatsApp e taxa de 1,01%**. Cidades consolidadas por `Região de segmentação`:
> São Paulo 9, Goiânia 2, Brasília 2 e Rio de Janeiro 1. Não tratar região de
> segmentação como prova de localização física. A campanha diária responde por
> 9 WhatsApp a R$ 13,58 cada; a anterior, por 5 a R$ 42,77. A API local segue
> indisponível por falta do developer token.
>
> **Também esperando o dono:** mídia nova da Gaveta para substituir o
> short reprovado por direitos autorais (os R$ 300 estão parados até lá).
>
> **Fila depois disso:** tag de WhatsApp para Sou Raízes, Chapéu de Bruxa e
> Encantaria; pixel da Meta em todos. Os dois primeiros seguem bloqueados por
> não terem site. Cliente novo **nasce em conta de anúncios própria** — não
> migrar quem já roda, mas parar de fazer o problema crescer.

> ## ▶︎ RETOMADA — auditoria de acessos em 08/08/2026 às 23:20
>
> Esta retomada **substitui o estado operacional das 09:04 onde houver
> conflito**. Branch `main`, HEAD inicial `cf9ee34`; alterações desta auditoria
> ainda não publicadas. Nenhuma escrita externa foi feita.
>
> **Google Ads local destravado.** A conta de serviço e o developer token já
> existiam em arquivos modo `600` no diretório protegido. O código passou a ler
> ambos por caminho, sem duplicar segredo em `.env`. `npm run governador`
> consultou a conta ao vivo; a data agora usa `America/Sao_Paulo` e o script
> também confere campanhas declaradas como pausadas.
>
> **⚠️ DIVERGÊNCIA ABERTA:** MARCA `24016194651` está `ENABLED` a R$ 8/dia e
> CASAMENTOS `24016194654` está `ENABLED` a R$ 12/dia. A decisão e o livro-caixa
> dizem `PAUSED`. MOVEIS/MESAS/PRODUTOS seguem `ENABLED` a R$ 6/R$ 5/R$ 3. O
> governador corrigido acusa as duas como `ativa_sem_declaracao` e sai com
> código 3. **Não foram pausadas:** alterar status exige aprovação explícita.
>
> Os únicos scripts visíveis são `GARBO | NEGATIVAS | 20260728` (`12009767`) e
> `GARBO | TRAVA R$100 | 20260728` (`11999683`), ambos sem frequência. Não há
> regras automatizadas. A trava executou às 08:49 sem ações; não voltou a pausar
> as três campanhas pretendidas.
>
> **Cássio em atenção:** leitura ao vivo do governador às 23:20 estimou 1,7 dia
> de saldo seguro para a campanha diária de R$ 50. Avisar/pedir novo Pix é ação
> externa e ainda não foi autorizado.
>
> **Acessos verificados:** `gh` como `dadocruz`; `gcloud` como
> `contato.automatizadoria@gmail.com` no projeto `automatizador-ia-ads`;
> Google Ads; GTM; Cloudflare; Hostinger e SSH `nvvps`. Containers GTM:
> Cássio `GTM-5JGMZBKZ`, Gabriel `GTM-5Z8QFW5B`, Garbo `GTM-W7CNZMLN` e
> NovaCena `GTM-P4RX9S2X`.
>
> **Ainda exige ação pessoal do dono:** entrar no n8n e no Meta nas abas já
> abertas, sem enviar senha/2FA no chat. Depois, gerar referência segura de API
> do n8n e token programático somente leitura da Cloudflare; no Meta, decidir
> se o escopo inclui campanhas ou somente pixels.
>
> **VPS:** 28 serviços 1/1 e sem containers parados/erro; disco 47%. Risco
> aberto: painel Hostinger mostra **zero firewall**, e a VPS publica
> 2377/tcp, 7946/tcp+udp, 4789/udp e 3000/tcp além de 22/80/443. Snapshot semanal
> existe, mas backup lógico/externo e restores da maioria dos bancos continuam
> sem prova. Criar firewall ou backup é escrita externa e aguarda lote exato +
> aprovação.
>
> Validação após as correções locais: lint, typecheck, **260 testes em 71
> suítes**, build e varredura completa de 183 arquivos — tudo verde, zero
> achados de segredo.

**Marcador operacional `CASSIO_CONVERTING`.** A API local foi destravada e, em
08/08 às 23:24, confirmou na campanha diária `24106867845`, desde 06/08:
**R$ 153,60 · 982 cliques · 14 em `WHATSAPP - CÁSSIO`**, custo de R$ 10,97 por
contato e taxa de 1,43%. A janela segmentada de 7 dias retornou 6 contatos; o
acumulado da própria campanha retornou 14. Não somar esse acumulado aos 14 do
XML histórico sem conciliar por campanha/período — seria dupla contagem.

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

> ## ▶︎ RETOMADA — integrações e memória por cliente em 09/08/2026 às 00:09
>
> Esta retomada substitui o bloco das 23:20 apenas nos temas Cloudflare, n8n,
> Meta, Garbo e Buteco. Branch `main`; antes deste lote havia um commit local
> ainda não publicado (`fd1ceeb`) e a árvore estava limpa.
>
> **Cloudflare destravada e provada.** Foi criado, com autorização explícita do
> dono, o token `automatizador-control-plane-readonly-20260808`, restrito à
> conta `e6d7a4863004885bdae7e63bbec5e1f7`, todas as zonas dessa conta e seis
> permissões exclusivamente `Read`. Expira em 06/11/2026. O valor foi salvo
> fora do Git, em arquivo modo `600`, e a rota de verificação retornou ativo.
> Nunca registrar o valor.
>
> `npm run inventario:cloudflare` agora reproduz a coleta sem escrita: **8
> zonas ativas, 14 registros DNS, 10 projetos Pages, 3 Workers, 6 domínios
> customizados de Worker e 0 túneis**. Conteúdo de TXT/CAA e tipos sensíveis é
> descartado pelo parser. A API confirmou: Cássio roda no Worker
> `cassio-ferraz`; Vivere no Worker `vivere`; Garbo no Pages `garbo`, vinculado
> ao repositório `dadocruz/garbo`. `automatizadoria.cloud` e
> `estudionovacena.com` não pertencem a essa conta Cloudflare — o provedor DNS
> deles continua desconhecido.
> O adaptador real foi ligado ao catálogo com as ações somente leitura
> `cloudflare.zones.list` e `cloudflare.dns.list`; `/status` recebe o estado
> real de habilitação. O objeto não expõe criar, editar ou apagar DNS.
> Smoke test com `npm run start:local`: API em `127.0.0.1`, kill switch
> `engaged`, `dry-run`, Cloudflare `enabled: true`, 10 ações no catálogo (3
> mutantes ainda bloqueadas). O processo local foi encerrado normalmente.
>
> **n8n autenticado, mas sem chave.** A interface `1.120.4` mostrou 30
> workflows, 1 ativo (`CRIAR CAMPANHA GOOGLE ADS`) e 29 inativos. Ao criar chave,
> a própria tela informa que editar escopos exige upgrade; a credencial
> disponível inclui permissões amplas, inclusive criação/exclusão de
> credenciais e projetos. A criação foi cancelada. Para continuar, o dono deve
> autorizar explicitamente uma chave ampla temporária com cliente local GET-only,
> ou aprovar um usuário PostgreSQL somente leitura. Não chamar isso de chave de
> inventário sem registrar o risco.
> A lista completa dos 30 nomes/status está em `inventory/n8n-workflows.yaml`.
> Cliente, nós, gatilhos, credenciais e efeitos continuam `unknown`; nenhum
> workflow foi aberto, executado ou alterado.
>
> **Meta:** o dono entrou pessoalmente e definiu o escopo: campanhas, pixels e
> medição. O seletor autenticado mostrou **19 portfólios empresariais**; a lista
> está em `inventory/meta.yaml`, com associações por nome mantidas como
> `discovered`/`unknown`. Ao abrir os ativos de `Dado Cruz`, o Meta exigiu chave
> de acesso/biometria. A solicitação foi acionada novamente às 00:29 de 09/08 e
> voltou ao mesmo modal sem liberar os ativos: o dono ainda precisa concluir a
> confirmação pessoalmente no macOS; nenhuma senha ou 2FA será solicitada.
> Contas, páginas, Instagram e datasets/pixels ainda não foram lidos; nenhuma
> campanha Meta foi alterada.
>
> **Memória isolada por cliente.** Cada um dos 8 slugs agora tem
> `clients/<slug>/memory.yaml`, com domínios, repositórios, WhatsApp, pixel,
> custo máximo por conversa e funil conversa→contrato. Não existe valor global
> de custo ou conversão. `npm run perguntar:cliente -- --cliente <slug>` mostra
> somente as lacunas daquele cliente; teste recusa arquivo cujo slug interno
> não coincide com a pasta.
>
> **Garbo:** o dono informou que atualizou pessoalmente as campanhas ativas em
> 08/08. Isso resolve a autoria em nível `owner_reported`, mas ainda não resolve
> a intenção exata: foi perguntado se deseja manter exatamente as cinco ativas,
> incluindo MARCA e CASAMENTOS. Até a resposta, não alterar nenhuma.
>
> **Buteco:** a mídia nova também foi rejeitada por direito autoral, apesar de
> usar trilha própria. O dono fará a reivindicação quando puder. A campanha
> `24105770570` continua congelada; `24079586567` continua removida.
>
> **Rotações adiadas por decisão do dono:** senha root da VPS e TOTP exposto da
> Vivere serão rotacionados somente depois de tudo testado e validado. O risco
> continua aberto e não deve ser marcado como resolvido.
>
> Validação final do lote local: lint, typecheck, **271 testes em 75 suítes**,
> build, **55 YAMLs**, `git diff --check` e scanner de segredos — tudo verde. A
> validação integral revelou três erros de sintaxe antigos: uma nota órfã em
> `inventory/google-ads.yaml` e o escopo `read:org` sem aspas em
> `inventory/accounts.yaml` e `inventory/integrations.yaml`. Só a sintaxe foi
> corrigida; nenhum valor operacional mudou. O scanner cobriu 183 arquivos
> rastreados e, separadamente, os 16 novos ainda não rastreados; zero achados.
> Coleta Cloudflare ao vivo também verde.

> ## ▶︎ RETOMADA — GitHub e VPS somente leitura em 09/08/2026 às 00:51
>
> O dono adiou a Meta e mandou seguir sem ela. O inventário de 19 portfólios foi
> preservado, mas biometria, contas, páginas e pixels não bloqueiam mais a fila.
> Não reutilizar dados Meta antigos e não alterar nenhum ativo.
>
> **GitHub real:** `GitHubReadClient` reutiliza o `gh` CLI do keychain, fixa o
> owner em `dadocruz`, não usa shell e só executa `gh repo list`. Leitura ao
> vivo confirmou 14 repositórios, 6 privados e 8 públicos; a lista de nomes
> coincide com `inventory/repositories.yaml`. O adaptador devolve
> `likelyClient: null` e não possui métodos de criar, editar, arquivar ou apagar.
>
> **VPS real:** `VpsReadClient` possui somente as operações `host`, `containers`
> e `stacks`, ligadas a comandos fixos. Um teste inicialmente mostrou que alias
> iniciado por `-` passava na validação; o formato foi fechado antes da leitura
> ao vivo. Estado em 09/08 00:49: Debian 11, 197 dias de uptime, 7.959 MiB de
> RAM total, 3.356 MiB disponíveis, disco 47%, 32 containers todos `running`,
> zero `unhealthy` e 13 stacks. Nenhuma variável, label ou segredo foi lido.
>
> O servidor local subiu com kill switch `engaged`, `dry-run`, aprovação humana
> obrigatória e WhatsApp desligado. GitHub, VPS e Cloudflare apareceram
> habilitados; n8n e Meta permaneceram desabilitados. Catálogo com 12 ações,
> sendo 3 mutantes bloqueadas. Nenhum processo local ficou rodando e nenhuma
> escrita externa foi executada.
>
> Validação deste lote: lint, typecheck, **282 testes em 77 suítes/16 arquivos**,
> build, carga dos **55 YAMLs** e `git diff --check` verdes. Scanner: 183
> arquivos rastreados e 24 novos não rastreados, zero achados. A árvore segue
> sem commit deste lote e `main` já estava um commit à frente de `origin/main`.
>
> **Google Ads/Cássio, leitura 09/08:** `npm run governador` mostrou 1,6 dia de
> saldo seguro para o Cássio (R$ 82,15 após gasto reportado e atraso estimado).
> `npm run relatorio:cassio` consulta ao vivo somente as cinco campanhas
> conhecidas e a ação `WHATSAPP - CÁSSIO`: às 01:02, 20 microconversões, 1.918
> cliques e R$ 368,97 nas Demand Gen, custo de R$ 18,45 por WhatsApp. Campanha
> atual: 15, 1.003 cliques, R$ 155,14 e R$ 10,34. Cidades por local de presença: São
> Paulo 9; Brasília, Goiânia e Rio 3 cada; Curitiba e Salvador 1 cada. Com o
> Search sem conversão, total de mídia R$ 406,57 e R$ 20,33 por WhatsApp.
> O XML tinha 14 porque foi exportado antes dos seis registros adicionais.
> Texto pronto em `reports/cassio-ferraz/relatorio-whatsapp-2026-08-09.md`;
> **não enviado**, porque mensagem externa exige aprovação específica.
>
> A mesma leitura confirmou as cinco campanhas Garbo `ENABLED`; MARCA e
> CASAMENTOS continuam `ativa_sem_declaracao`. Nenhuma mudança aplicada: aguarda
> o dono confirmar se as duas devem permanecer ativas nos orçamentos atuais.

> ## ▶︎ RETOMADA — Garbo reconciliada e n8n programático em 09/08/2026 às 01:25
>
> **Garbo resolvida:** o dono confirmou que deseja manter exatamente as cinco
> campanhas ativas nos valores atuais: R$ 6, R$ 5, R$ 3, R$ 8 e R$ 12/dia.
> O livro-caixa passou de R$ 14 para R$ 34/dia e MARCA/CASAMENTOS foram movidas
> para `campanhasAtivas`. Nenhuma campanha, orçamento ou status foi alterado no
> Google Ads; somente a intenção versionada foi reconciliada. O governador
> leu as cinco `ENABLED` com os cinco orçamentos corretos e zero divergências.
> Resultado financeiro: Garbo com R$ 54,73 seguros (1,6 dia); Cássio com
> R$ 81,91 seguros (1,6 dia). Nenhuma mensagem foi enviada.
>
> **n8n programático:** com autorização explícita, foi criada a chave
> `automatizador-control-plane-temporaria-20260809`, ampla por limitação do
> plano e com expiração em 16/08/2026. O valor vive fora do Git em arquivo
> modo `600`. `N8nReadClient` implementa exclusivamente GET e descarta nós,
> parâmetros, conexões, webhooks e dados de credenciais antes da saída.
> Leitura reproduzível: `npm run inventario:n8n`.
>
> A API confirmou **33 workflows: 1 ativo, 32 inativos e 3 arquivados**. A UI
> mostra 30 porque não inclui os arquivados. Todas as associações a cliente
> estão `unknown`; nenhuma foi inferida pelo nome. A rota
> `GET /api/v1/credentials` respondeu HTTP 405, registrada como indisponível,
> não como zero credenciais. Nenhum workflow foi aberto, executado ou alterado.
>
> **Meta permanece adiada** por decisão do dono. Não houve leitura adicional
> nem qualquer alteração em campanhas, pixels ou medição Meta.
>
> Validação limpa: `npm ci`, lint, typecheck, **290 testes em 79 suítes/17
> arquivos**, build, 55 YAMLs, `git diff --check` e scanners de 183 arquivos
> rastreados + 28 novos, tudo verde e zero achado de segredo. Smoke local:
> kill switch `engaged`, `dry-run`, aprovação obrigatória, WhatsApp/Meta
> desligados e GitHub/VPS/Cloudflare/n8n habilitados; 12 ações, 3 mutantes
> bloqueadas. Publicação autorizada pelo dono e realizada na `main` no commit
> desta retomada; conferir o SHA atual com `git log -1 --oneline`.

> ## ▶︎ RETOMADA — inventário Meta e bloqueio correto em 09/08/2026
>
> O dono retomou a Meta e pediu orientação para criar o acesso programático.
> A leitura autenticada entrou no portfólio `Dado Cruz` (`488135221601055`),
> que está verificado. Nenhuma campanha, pixel, usuário ou permissão foi alterado.
>
> **Fatos:** uma conta de anúncios `ADM 01` (`1217584809532823`); três Páginas
> visíveis contra quatro no resumo; Instagram `fotografiasedesign` com análise
> necessária; dois pixels/datasets NovaCena sem eventos; três usuários do
> sistema; app `Dado Cruz` (`495604383589426`) não publicado e configurado para
> Login do Facebook para Empresas. A política de 2FA do portfólio está em
> `Ninguém`.
>
> A Meta exigiu chave de acesso para gerar/anular token. O botão `Usar chave de
> acesso` foi acionado e a confirmação pessoal continua pendente na aba. Mesmo
> depois dela, **não gerar token ainda**: falta o dono confirmar se `Dado Cruz`
> é o portfólio central da AutomatizadorIA e se o app existente tem outro uso.
> O plano exato está em `docs/operations/meta-validacao-e-acesso.md`.

> ## ▶︎ RETOMADA — recuperação de acesso Meta em 09/08/2026
>
> Com autorização explícita do dono, foram removidas da Meta as duas chaves de
> acesso antigas registradas no Gerenciador de Senhas do Google. As duas
> apontavam para uma credencial que o celular não encontrava; cada remoção foi
> confirmada individualmente pela interface. Nenhum valor de senha, código ou
> chave foi lido ou registrado.
>
> O método alternativo por WhatsApp foi usado com entrada pessoal do código e a
> interface confirmou que a autenticação de dois fatores do perfil Facebook
> `Dado Cruz` continua ativada. A lista de chaves de acesso ficou vazia.
>
> A tentativa de criar uma substituta no navegador abriu o fluxo entre
> dispositivos por QR; o celular retornou erro e a Meta não registrou chave
> nova. Uma segunda conferência mostrou novamente apenas `Criar chave de
> acesso`, portanto **não declarar a substituição concluída**. O acesso segue
> protegido pelo 2FA existente; nova chave só deve ser criada num dispositivo
> cujo gerenciador de credenciais consiga concluí-la e depois confirmada na
> lista da Meta.
>
> Ao reabrir configuração sensível, a Meta passou a exigir a senha novamente.
> O prompt foi fechado sem preenchimento. Continua proibido pedir ou receber
> senha/código no chat. Esta correção não autoriza token, campanha, pixel ou
> qualquer outra mutação Meta; permanece pendente a decisão do portfólio
> central descrita abaixo.


## ▶︎ RETOMADA — inventário de ativos Meta em 09/08/2026

Inventário visual concluído e registrado em `inventory/meta-assets.yaml`. Fatos verificados na interface: Páginas Fotografiasedesign (`1072672662585363`), Dado Cruz (`2021185101532717`) e 4cadeiras (`1131094210082197`); Instagram `@fotografiasedesign`, business asset `103868239031431`, Instagram ID `17841404791869061`, com status **Análise necessária**; datasets Estúdio NovaCena (business asset `1022054830503166`, ID exibido `1349340487097325`) e NovaCena Motion (business asset `979023691508854`, ID exibido `1640871190359011`), ambos sem eventos recebidos.

A tela Contas do WhatsApp exibiu zero linhas. Isso foi registrado como `unknown`, não como inexistência: pode haver número ligado por outra superfície, portfólio ou Página. Nenhuma Página, Instagram, WhatsApp ou dataset foi atribuído ao usuário do sistema nesta etapa. Todas as associações cliente↔ativo permanecem `verificationStatus: unknown` até confirmação por ID do dono.

Bloqueio correto para anúncios com destino ao WhatsApp: antes do dry-run de campanha, identificar a Página, o Instagram e o número/conta WhatsApp do cliente correto. Não usar o nome `Fotografiasedesign` nem `NovaCena` como prova de associação.
