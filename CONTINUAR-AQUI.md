# CONTINUAR AQUI

**Ponto de entrada único para quem assume este projeto.** Escrito em
07/08/2026, ao fim de uma sessão longa. Se você é um agente começando do zero
neste repositório, leia este arquivo inteiro antes de qualquer ação.

---

## 0. A regra que vale mais que todas as outras

**Não invente. Verifique ou pergunte.**

Este repositório opera dinheiro real de clientes reais numa conta de anúncios
**compartilhada**. Um palpite plausível aqui não dá erro — dá prejuízo silencioso
no cliente errado.

Sempre que a associação de um recurso a um cliente não for certa, registre
`verificationStatus: unknown` e **pergunte ao dono**. Valores válidos:
`owner_reported`, `discovered`, `verified`, `conflicting`, `stale`, `unknown`.

Erros reais já cometidos neste projeto, todos por inferência plausível:

- IDs de campanha deduzidos por proximidade no HTML da interface: **três dos
  cinco nomes da Garbo saíram errados**. Não foram gravados por sorte.
- Uma alteração de conta compartilhada foi refeita por não ter lido o HANDOFF:
  ela já tinha sido feita e revertida por um motivo documentado.
- Logo de outro cliente foi parar no anúncio do Cássio. Pego antes de publicar.
- Cidades erradas adicionadas por atalho de teclado — inclusive **Ilanz, na
  Suíça**, numa campanha regional de Sorocaba.

O padrão é sempre o mesmo: o resultado parecia certo e ninguém checou.

---

## 1. Ordem de leitura obrigatória

| # | Arquivo | Por quê |
|---|---|---|
| 1 | `CLAUDE.md` | Regras invioláveis, kill switch, segredos, separação de contas Google |
| 2 | `HANDOFF.md` | **A fonte da verdade.** Comece pelos blocos `✅ INCIDENTE FECHADO` e `▶︎ RETOMADA` na §13 |
| 3 | `DECISIONS.md` | Toda decisão com o motivo. Não refaça decisão registrada sem ler o porquê |
| 4 | `docs/operations/protocolo-campanha-pre-paga.md` | Como o modelo de saldo funciona |
| 5 | `docs/operations/padrao-medicao-por-cliente.md` | Como medir cada cliente sem misturar |
| 6 | `inventory/saldo-por-cliente.yaml` | Livro-caixa: quem depositou quanto |
| 7 | `packages/integrations/src/google-ads/scope.ts` | A barreira de isolamento entre clientes |
| 8 | `docs/operations/o-que-falta-o-dono-fornecer.md` | **O que está bloqueado esperando o dono** — credencial, decisão ou arquivo |
| 9 | `TASKS.md`, `STATUS.md` | Pendências |

Validação antes de mexer em qualquer coisa:

```bash
npm ci && npm run verify && npm run scan:secrets:all
```

Estado esperado em 07/08: **256 testes, 70 suítes, tudo verde.** Lint e
typecheck limpos. Se não estiver assim, conserte antes de seguir.

---

## 2. O que é FATO VERIFICADO (pode confiar)

Tudo abaixo foi lido da API ou da interface e conferido.

### Conta de anúncios

- Conta anunciante `2656966896`, gerenciadora `3992594849`.
- **Compartilhada entre Cássio, Garbo, NovaCena e Gaveta.** Não há carteira por
  campanha no Google Ads: um saldo só, e quem veicula consome dele.
- Fundos disponíveis em 07/08: **R$ 685,44**. Último pagamento R$ 2.300 em
  19/06, Pix, pagamento manual.
- Rateio declarado pelo dono: Gaveta R$ 300, Garbo R$ 100, Cássio R$ 285,44.
  **É intenção, não trava.** Nada no Google impede um cliente de consumir a
  fatia do outro.
- API **fixada na v22**. A v21 foi bloqueada; a v23+ removeu
  `campaign.start_date` e `campaign.end_date`, que o monitor usa. Não suba.

### Cássio Ferraz — `cassio-ferraz`

- Campanha ativa: **24106867845** — `CASSIO | DEMAND_GEN | VIDEO_DVD |
  CONTRATANTES | DIARIO`, R$ 50/dia, sem data de término, Maximizar cliques.
- Campanha antiga **24066140634** pausada em 06/08. Foi substituída porque o
  orçamento `CUSTOM_PERIOD` espalhava R$ 472,94 por 24 dias ≈ R$ 19,70/dia e
  sufocava a entrega. **Os 5 contatos históricos estão nela**, todos de 29/07.
- Consolidado em 08/08 às 09:18 a partir do XML exportado às 09:12 (`Todo o
  período`, cinco campanhas Cássio) e do relatório de Locais ao vivo: **1.388
  cliques de anúncio, R$ 373,63 gastos e 14 registros em `WHATSAPP - CÁSSIO`**.
  Custo consolidado por registro: **R$ 26,69**; taxa WhatsApp/clique: **1,01%**.
- Cidades consolidadas: São Paulo 9, Goiânia 2, Brasília 2 e Rio de Janeiro 1.
  São **regiões de segmentação do Google Ads**, não prova de localização física
  do usuário.
- Campanha diária `24106867845`: 466 cliques, R$ 122,20, 9 WhatsApp e R$ 13,58
  por registro. Campanha anterior `24066140634`: 915 cliques, R$ 213,83,
  5 WhatsApp e R$ 42,77 por registro. O piloto Search gastou R$ 37,60 em
  7 cliques e gerou zero WhatsApp; as outras duas campanhas ficaram zeradas.
- Site `cassioferraz.com.br` corrigido: 45 links de WhatsApp e 19 de redes
  sociais agora têm `href` real no HTML (antes eram `href="#"` preenchidos por
  JS); CTA do hero vai ao WhatsApp; formulário caiu de 5 campos obrigatórios
  para 2. Repositório `dadocruz/cassio-ferraz`. **Deploy é manual**:
  `npx wrangler deploy`. Commitar não publica.

### Garbo Eventos — `garbo-eventos` (responsável: Andréia)

Cinco campanhas de Search, CPC manual, Campinas e região, criadas em 10/07.

| ID | Nome | Estado ao vivo em 08/08 às 23:20 |
|---|---|---|
| 24016194642 | `GARBO \| SEARCH \| MOVEIS EVENTOS \| CAMPINAS` | **ativa**, R$ 6/dia |
| 24016194645 | `GARBO \| SEARCH \| MESAS CADEIRAS \| CAMPINAS` | **ativa**, R$ 5/dia |
| 24016194648 | `GARBO \| SEARCH \| PRODUTOS ESPECIFICOS \| CAMPINAS` | **ativa**, R$ 3/dia |
| 24016194651 | `GARBO \| SEARCH \| MARCA \| CAMPINAS` | **ativa fora do plano**, R$ 8/dia |
| 24016194654 | `GARBO \| SEARCH \| CASAMENTOS EVENTOS \| CAMPINAS` | **ativa fora do plano**, R$ 12/dia |

> **DIVERGÊNCIA ABERTA:** o livro-caixa e a decisão vigente dizem que MARCA e
> CASAMENTOS devem estar pausadas. A API confirmou as duas `ENABLED`; o
> governador corrigido acusa `ativa_sem_declaracao`. Não pausar sem aprovação.

Histórico de 10/07 a 06/08, com as cinco rodando a R$ 3–12/dia:
**R$ 221,60 · 145 cliques · 29 conversas de WhatsApp · R$ 7,64 por conversa.**

Por campanha: MOVEIS 11 conversas (R$ 11,07 cada) · MESAS 10 (R$ 4,55) ·
PRODUTOS 6 (R$ 2,36) · CASAMENTOS 2 (R$ 20,11) · MARCA 0, nunca rodou.

> **A Garbo nunca foi mal. Estava sem verba.** Quatro das cinco eram marcadas
> `Limitada pelo orçamento`. Os R$ 100 da Andréia foram rateados
> proporcionalmente às conversas geradas, excluindo as duas que não produziram.
>
> **Ressalva registrada:** a proporção premia volume, não eficiência. PRODUTOS
> entrega conversa a R$ 2,36 e MOVEIS a R$ 11,07 — quase 5× mais caro, mas
> levou a maior fatia. Se a meta virar custo por conversa, a ordem se inverte.

### Gaveta / Buteco Sertanejo — `gaveta-producoes`

- Campanha **24105770570** — `DG | Buteco Sertanejo | Shorts | Spotify`.
  Ativada, R$ 300 total, período 5–11/ago.
- **Anúncio 819900433355 REPROVADO por `COPYRIGHTED_CONTENT`, severidade
  `FULLY_LIMITED`.** Gasta zero porque não pode veicular.
- O dono vai enviar mídia nova para substituir o short. **Até lá, não mexer.**
  A campanha termina dia 11 — os R$ 300 têm prazo.
- Campanha **24079586567** foi removida pelo dono. Não reativar, não recriar.

### NovaCena — `novacena` (a produtora do próprio dono)

- **23956482634** `VÍDEO - NOVACENA MOTION` — pausada, R$ 100/dia, grupos de
  anúncios também pausados.
- **23951683643** `VENDAS - NOVACENA MOTION` — pausada, R$ 100/dia,
  **Maximizar conversões**. É a única da conta com período de aprendizado de
  Smart Bidding caro de verdade. Reativar com cuidado extra.

### Medição por cliente

A coluna "Conversões" do Google Ads é **da conta inteira** — soma todos os
clientes. Usá-la como resultado de um cliente é proibido pelo HANDOFF §3.4.

O que serve é **coluna personalizada por ação de conversão**, usando a métrica
`Todas as conversões` (nunca `Conversões`, que só conta ações primárias).

As ações de conversão são **secundárias de propósito**. Promover a primária
mistura a linha de base de todos os clientes sem ganho para a auditoria. Isso
já foi feito e revertido uma vez — não refaça.

Colunas existentes: `CÁSSIO - WHATSAPP`, `CÁSSIO - FORMULÁRIOS`,
`WhatsApp | GARBO`, `WhatsApp | NOVACENA`.

### Monitoramento — no ar e provado

- `.github/workflows/monitor.yml`, cron `0 9,21 * * *` (06:00 e 18:00 BRT).
- Execuções **#4, #5 e #8 vieram marcadas `Scheduled`** — o agendamento existe
  fora de qualquer sessão. Essa é a prova.
- Dois scripts, ambos **somente leitura**:
  - `scripts/google-ads-monitor.mts` — desempenho da campanha do Cássio;
  - `scripts/governador-orcamento.mts` — saldo por cliente e divergências.
- Última execução: **#10, verde, no commit `07baab2`**.

> ⚠️ **ARMADILHA JÁ VIVIDA:** o `schedule` roda a partir da **`main`**. A
> execução #5 ficou verde vigiando uma campanha **pausada** porque rodou em
> commit anterior ao merge. **Confira em qual commit a execução rodou, não só
> se ficou verde.**

### Governador de orçamento

`packages/integrations/src/google-ads/budget-governor.ts` — função pura, sem
I/O, 100% testada.

Ele **propõe, não aplica**. Decisão explícita do dono: *"me avise antes, me dê a
sugestão correta para eu decidir, e aí aplique."* Aplicar passa por
`planCampaignBudget` + `execute`, com hash de aprovação.

Três coisas que a intuição erra e estão fixadas em teste:

1. **O teto seguro é `restante ÷ 2`, não `restante`.** O Google gasta até 2× o
   orçamento diário num dia isolado e compensa no mês — mas o saldo do cliente
   já foi.
2. **Desconta o gasto ainda não reportado.** O relatório atrasa; tratar o número
   como verdade subestima o consumo justamente quando a margem é menor.
3. **Nunca recomenda aumento.** Governador que sobe orçamento sozinho deixa de
   ser freio e vira acelerador.

E a detecção de divergência, criada depois do incidente abaixo: compara o que o
livro-caixa declara com o que a conta tem, em quatro eixos (`pausada_sem_aviso`,
`ativa_sem_declaracao`, `removida`, `orcamento_diferente`).

> **Por que ela é necessária:** com a Garbo pausada e sem gastar, o governador
> reportava **`saudável`, 6,1 dias de saldo**. Ela estava saudável *porque* não
> rodava. **Saldo intacto e campanha parada produzem o mesmo número.**

### Livro-caixa

`inventory/saldo-por-cliente.yaml`. Três números por depósito:

```
recebidoDoCliente = comissao + depositadoEmAds
```

**Regra vigente desde 07/08: mensalidade separada, Pix vai inteiro para
anúncio** (`comissao: 0.00`). Lance `0.00` explicitamente, **nunca `null`** —
ausência de declaração não pode ser lida como ausência de retenção, e o
governador alerta enquanto for `null`.

---

## 3. Incidente encerrado e incertezas remanescentes

### Incidente fechado: um script legado pausou a Garbo

**Verificado em 08/08 na interface do Google Ads**, com o filtro de status
ampliado de `Ativadas` para `Todas` (78 campanhas). O filtro herdado escondia os
eventos e explicava por que a primeira leitura parecia vazia.

O Histórico de Alterações mostra, em 07/08:

- 14:25:55 — as três campanhas foram ativadas manualmente por
  `contato.automatizadoria@gmail.com`;
- 14:49:19 — `Script do Google Ads`, sob a mesma conta, mudou exatamente
  `24016194642`, `24016194645` e `24016194648` de ativa para pausada;
- houve o mesmo ciclo às 01:27:05/01:49:19.

O Histórico de scripts identifica a automação sem ambiguidade:
`GARBO | TRAVA R$100 | 20260728` (ID interno `11999683`), agendada de hora em
hora. O código ainda usa `START_DATE = 20260728`, teto de R$ 100 e pausa
preventiva em R$ 90. O novo depósito de 07/08 foi lançado e as campanhas foram
reativadas sem atualizar esses parâmetros; como o gasto acumulado desde 28/07
já passava de R$ 90, o script pausou tudo que encontrou ativo.

**Não é incidente de acesso à conta nem ação de terceiro.** É conflito entre
uma trava legada de lote e a nova operação/governador.

Com aprovação explícita do dono em 08/08, a frequência do script foi alterada
de `Por hora` para `Nenhuma` (`—` na tabela). **O script, seu código e o status
`Ativado` foram preservados; nada foi apagado.** Só depois disso foram
reativadas exatamente `24016194642`, `24016194645` e `24016194648`, mantendo
R$ 6/dia, R$ 5/dia e R$ 3/dia. Naquele momento `24016194651` e `24016194654`
foram confirmadas pausadas; às 23:20 a API encontrou ambas ativas novamente.
O autor dessa ativação ainda não foi apurado e nenhuma correção foi aplicada.

Relatório reconferido na mesma sessão: o crédito de R$ 100 da Andréia gerou
**0 registros em `WhatsApp | GARBO` em 07/08 e 0 em 08/08 até 09:04**. Não
confundir esse zero com o histórico anterior de 29 conversas: ele mede somente
o lote novo, que ficou pausado até a manhã de 08/08.

### Outras incertezas honestas

- **Garbo com R$ 0,00 e 0 WhatsApp em 07/08 e até 09:04 de 08/08** agora está
  explicado pela pausa e pela reativação recente, não por anúncio,
  palavra-chave ou lance. Só volte a avaliar entrega depois de a campanha
  permanecer continuamente ativa.
- **`CASSIO | LEAD QUALIFICADO | FORM` está Inativa** — nenhuma conversão em 30
  dias. A cadeia de medição parece íntegra. Hipótese principal: ninguém
  completava o formulário (eram 11 campos, 5 obrigatórios; caiu para 2 em
  07/08). Não confirmado.
- **Encantaria**: o Directus está vazio apesar do site no ar. O conteúdo mora em
  lugar não mapeado. `unknown`.
- **CPC do Cássio variou por dia.** O R$ 0,57 de 07/08 não deve ser projetado
  como regime: o consolidado das cinco campanhas está em R$ 0,27 por clique e
  a campanha diária em R$ 0,26. Vigiar a série, não agir por um dia isolado.

---

## 4. Regras que não podem ser quebradas

1. **Kill switch (`CONTROL_PLANE_KILL_SWITCH`) começa `true`.** Nenhuma ação
   externa com efeito colateral roda sem desligamento explícito e aprovado.
2. **Somente leitura na VPS.** Nunca reiniciar, parar, remover, instalar,
   atualizar ou `prune`.
3. **Buteco Sertanejo: NÃO MEXER** até a mídia nova chegar.
4. **Nunca `force push`. Nunca apagar recursos.**
5. **Segredo não entra em arquivo versionado.** Nem em exemplo, log, inventário
   ou mensagem de commit. Proibido: `cat .env`, `printenv`, `env`,
   `docker inspect` completo. Ao encontrar possível segredo, reporte **arquivo,
   tipo provável e ação — nunca o valor**.
6. **Contas Google separadas:** `contato.automatizadoria@gmail.com` é a conta
   administrativa canônica; `estudionovacena@gmail.com` é exclusiva da NovaCena.
   Não misturar arquivos, e-mails, agendas ou recursos.
7. **WhatsApp está desabilitado nesta fase.**

### Peça aprovação ANTES de

Desligar o kill switch · qualquer escrita na VPS, n8n, Cloudflare, DNS ou banco ·
alterar repositório que não seja este · criar, pausar ou editar campanha ·
alterar orçamento · enviar mensagem ou publicar conteúdo · apagar qualquer coisa ·
adicionar dependência com acesso a rede ou credencial.

### Não precisa pedir para

Ler · inventariar · documentar · rodar lint, typecheck, teste e build · corrigir
erro reversível dentro deste repositório.

---

## 5. Fila de trabalho, em ordem

**1. Decisão do dono sobre a divergência Garbo.** MARCA `24016194651` e
CASAMENTOS `24016194654` estão ativas fora do plano, somando R$ 20/dia. O lote
exato proposto é pausar somente as duas, sem alterar orçamento nem tocar nas
outras campanhas.

**2. Cássio precisa de recarga.** O governador estimou 1,7 dia de saldo seguro
às 23:20. Pedir Pix/enviar mensagem requer aprovação; a leitura da API já está
funcionando localmente.

**3. O dono entra pessoalmente no n8n e no Meta** nas abas abertas, sem passar
senha ou 2FA no chat. Depois gerar API key de inventário do n8n e confirmar se
Meta entra para campanhas ou apenas pixels.

**4. Token somente leitura da Cloudflare.** O painel já confirmou 8 zonas e 14
Workers/Pages; falta acesso programático para DNS e mapa domínio → cliente.

**5. Segurança da VPS.** Hostinger confirmou zero firewall; 2377, 7946, 4789 e
3000 estão públicos. Propor lote exato antes de escrever. Backups externos e
restores da maioria dos bancos continuam sem prova.

**6. Mídia nova da Gaveta** — esperando o dono. A campanha termina dia 11.

**7. Tag de WhatsApp para Sou Raízes, Chapéu de Bruxa e Encantaria**, e pixel da
Meta em todos. Os dois primeiros estão **bloqueados por não terem site**. Siga
o checklist de `docs/operations/padrao-medicao-por-cliente.md`.

**8. Cliente novo nasce em conta de anúncios própria.** Não migrar quem já roda
— o bônus do Google é maior concentrando volume, e migrar custa histórico e
aprendizado. Mas parar de fazer o problema crescer. Troca consciente:
isolamento por bônus.

### Pendências de segurança, não esquecer

- Rotacionar a senha root da VPS (foi colada em chat).
- Rotacionar o TOTP em `clients/vivere/security.yaml`.
- Firewall no painel da Hostinger: o host está com `-P INPUT ACCEPT` e zero
  regras de INPUT.
- Backups da VPS são locais; falta cópia externa.

---

## 6. Coisas operacionais que economizam tempo

**Colher ID de campanha sem errar.** O `href` de cada linha na lista de
campanhas é **preenchido sob demanda** — a linha nasce sem ele e só recebe o
endereço após clique ou hover real. Não deduza por proximidade no HTML; a
coluna `ID da campanha` da própria tabela confirma.

**Mexeu em `package.json`, regenere o lock.** O workflow roda `npm ci`, que
recusa lock fora de sincronia. Valide com `npm ci` num diretório limpo, não com
`npm install`. Isso já quebrou o monitor uma vez.

**Deploy do site do Cássio é manual.** `npx wrangler deploy`, Worker com assets
estáticos. `.assetsignore` exclui `.git`. Commitar não publica.

**Atalhos de teclado do Google Ads.** Digitar em campo não focado é interpretado
como atalho — "G" e "A" navegam para Anúncios. Sempre confirme o foco com
screenshot antes de digitar.

**Locks do git no mount.** Se estiver operando via mount de container, o git não
consegue apagar os locks que ele mesmo cria. `rm -f .git/index.lock
.git/HEAD.lock` precisa ser rodado pelo dono, no terminal dele.

---

## 7. Como reportar resultado do Cássio

- **`CASSIO_DELIVERING`** — há entrega, sem contato novo confirmado.
- **`CASSIO_CONVERTING`** — só depois de novo `WHATSAPP - CÁSSIO` confirmado
  **pela API**, nunca pela interface.

Em 07/08 a interface mostrou 2 contatos. **Confirme pela API antes de declarar
`CASSIO_CONVERTING`.**

Lembrete: houve uma **conversão de teste em 05/08 às 23:09** que deve ser
descontada de qualquer contagem. Ela não apareceu na leitura da API daquele dia
— hipótese: navegou direto sem `gclid`. Conferir antes de dar por encerrado.
