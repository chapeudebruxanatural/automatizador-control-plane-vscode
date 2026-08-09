# DECISIONS

Registro cronológico de decisões. Decisões arquiteturais extensas ganham um ADR
em `docs/adr/` e aparecem aqui como uma linha com link.

Formato: **data — decisão** · motivo · consequência.

---

## 2026-08-05 — Incidente: scripts de backup ignorados em silêncio pelo `.gitignore`

**O que aconteceu.** Os quatro arquivos de `scripts/backup/` (`lib.sh`,
`backup-postgres.sh`, `backup-volumes.sh`, `backup-configs.sh`) foram escritos,
testados em dry-run e em execução real com dados sintéticos, e o PR #1
descreveu-os como entregues — mas nunca haviam sido commitados. A regra
`backup/` no `.gitignore` (sem barra inicial, portanto casando em qualquer
profundidade) foi escrita para bloquear *diretórios de dados* de backup e
acabou também bloqueando `scripts/backup/`, que é código. `git add -A` ignora
arquivos ignorados sem avisar — não houve erro, não houve sinal.

**Como foi encontrado.** Revisão externa do PR notou que a árvore publicada no
GitHub não tinha a pasta que a documentação descrevia.

**Correção.** Negação explícita no `.gitignore`
(`!scripts/backup/` + `!scripts/backup/**`), confirmada com
`git check-ignore` antes e depois. Os arquivos foram revisados de novo
(scanner de segredos, dry-run, execução real) antes do commit — não bastava
"agora aparece no `git status`", precisava continuar correto.

**Motivo de registrar.** Não é só o bug do `.gitignore`. É que eu declarei
algo como entregue sem confirmar que estava versionado — "escrito em disco" e
"commitado" são coisas diferentes, e só a segunda conta para efeito de
entrega. `git status --short` e `git ls-files` deveriam fazer parte de toda
checklist de "isto está pronto", não só do `git add`.

**Consequência.** Antes de declarar qualquer entrega de código pronta, checar
`git status --short` e `git diff --stat` contra o que foi de fato pedido —
não presumir que Write bem-sucedido implica arquivo rastreado pelo Git.

---

## 2026-08-04 — Fundação do Control Plane

**Repositório central privado, separado dos repositórios de clientes.**
Motivo: o Control Plane conhece todos os clientes; misturá-lo a um repositório de
cliente vazaria contexto entre contas. Consequência: um repositório a mais para
manter, mas fronteira de dados clara.

**Kill switch ligado por padrão, com `dry-run` como modo de execução inicial.**
Motivo: o sistema vai operar sobre infraestrutura de produção e verba de anúncios.
O custo de uma ação errada é maior que o custo de um passo manual a mais.
Consequência: toda escrita exige desligamento explícito e registrado.
Ver [ADR 0002](docs/adr/0002-kill-switch-por-padrao.md).

**Camada de conhecimento antes da camada de execução.**
Motivo: existem repositórios sem dono declarado e workflows sem documentação.
Automatizar antes de inventariar amplifica o desconhecido.
Consequência: esta fase entrega mais YAML e Markdown do que código.

**Procedência explícita em todo dado de inventário (`verificationStatus`).**
Motivo: parte do conhecimento vem de inferência (nome de repositório sugere
cliente). Tratar inferência como fato produz erro silencioso.
Consequência: campos a mais em cada registro, e a obrigação de nunca promover
`discovered` para `verified` sem checagem real.
Ver [ADR 0003](docs/adr/0003-procedencia-do-inventario.md).

**Sem Docker no ambiente de desenvolvimento local.**
Motivo: o Mac não tem Docker instalado e a VPS não deve ser alterada para
compensar. Instalar Docker agora atrasaria a fundação sem benefício imediato.
Consequência: a aplicação local não tem paridade com a VPS. Aceitável enquanto
não houver dependência de banco ou fila. Revisar quando isso mudar.
Ver [ADR 0001](docs/adr/0001-sem-docker-local.md).

**Zero dependências de runtime além de validação de esquema.**
Motivo: superfície de supply chain em um sistema que segura credenciais de
produção. A API usa o módulo `http` nativo do Node em vez de um framework.
Consequência: um pouco mais de código de roteamento, muito menos código de
terceiros no caminho de execução.

**Acesso ao GitHub pelo `gh` CLI, sem duplicar token em `.env`.**
Motivo: o token já vive no keychain do macOS, protegido pelo sistema
operacional. Copiá-lo para um arquivo aumenta a exposição sem ganho.
Consequência: o `GitHubAdapter` dependerá do `gh` instalado e autenticado.

**Separação estrita entre as contas Google `contato.automatizadoria@gmail.com`
(canônica da AutomatizadorIA) e `estudionovacena@gmail.com` (Novacena).**
Motivo: instrução explícita do dono; são operações distintas, com clientes e
dados distintos. Consequência: credenciais, escopos e automações separados por
conta, registrados na matriz de acessos. Nenhuma automação pode ler de uma e
escrever na outra.

**WhatsApp fora de escopo nesta fase.**
Motivo: é o único canal que fala diretamente com o cliente final. Um erro ali é
público e irreversível. Consequência: só entra depois que auditoria, aprovação e
kill switch estiverem exercitados em canais de menor risco.

**VPS tratada como somente leitura por padrão.**
Motivo: há serviços de produção rodando e nenhum inventário prévio. Ler antes de
tocar. Consequência: qualquer mudança na VPS exige aprovação específica e um
runbook, não um comando avulso.

---

## 2026-08-05 — Plataforma de agente

**Versão da Google Ads API fixada em v22, não na mais nova.**
Motivo: a v21 passou a ser bloqueada em rollout progressivo e a integração
quebrou sozinha, com o build verde. Testadas contra a conta real, v22 a v25
respondem a tudo em uso — mas a partir da v23 `campaign.start_date` e
`campaign.end_date` devolvem `UNRECOGNIZED_FIELD`, e é por eles que o plano de
recuperação estende a data final da campanha. Consequência: subir além da v22
exige antes descobrir o substituto dos campos de data e ajustar o
`write-adapter`. Há teste travando as duas pontas.

**O modelo não chama API; escolhe entre ações declaradas.**
Motivo: um modelo com HTTP direto faz qualquer coisa que a credencial permita, e
a credencial permite muito. Consequência: toda ação alcançável por agente precisa
de definição no `ActionRegistry` e de capacidade no `CapabilityCatalog` — duas
decisões separadas, engenharia e operação, que não devem acontecer pelo mesmo
gesto.

**Escrita por WhatsApp exige código de confirmação derivado do plano.**
Motivo: comando por celular sem confirmação é imprudente; com código sorteado,
o código não prova qual plano foi lido. Consequência: o código é prefixo do
SHA-256 do plano, então só confere para aquele plano exato — se algo mudar entre
planejar e confirmar, a execução é recusada sozinha.

**Ambiguidade de cliente é recusa, não escolha do mais provável.**
Motivo: `garbo-eventos` e `gaveta-producoes` colidem, assim como `cassio-ferraz`
e `chapeu-de-bruxa`. Um resolvedor que chuta mexeria na conta errada.
Consequência: o agente pergunta, e perguntar custa uma mensagem.

**Confirmação pendente fica em memória, não em banco.**
Motivo: um plano é foto do estado. Se o serviço caiu entre o plano e a
confirmação, o estado fotografado já não é confiável. Consequência: reinício
invalida pendências, e o dono pede de novo em vez de confirmar às cegas.

**Fase de WhatsApp somente leitura antes de qualquer escrita.**
Motivo: é onde se descobre, sem risco financeiro, se o agente confunde um
cliente com outro. Consequência: erros de interpretação aparecem baratos.

---

## 2026-08-06 — Landing do Cássio verificada; `primary_for_goal` refeito e revertido

**A landing do Cássio está aprovada. A campanha não é limitada por ela.**
Motivo: era a lacuna registrada em §6.1 do HANDOFF — verba liberada sem teste.
Testada com os UTMs do anúncio: carregamento OK, HTTPS OK, sem redirect, bolha
flutuante do WhatsApp 54×54 px sempre visível, número `5515991320687` idêntico
nos três pontos de entrada, mensagem pré-preenchida correta. Clique real disparou
`whatsapp_click` **exatamente uma vez**, com uma requisição de conversão para
`AW-18088952203`. O WhatsApp abriu na tela anterior ao envio; nada foi enviado.
Consequência: a hipótese B (problema pós-clique) segue parcial pela taxa de 0,9%,
mas não por defeito técnico da página. `MONITOR_NOT_DEPLOYED` e a queda de entrega
(hipótese C) continuam sendo a causa principal.

**Conversão de teste a descontar: 05/08/2026, 23:09:24–23:09:27 BRT.**
Clique meu, com UTMs da campanha ativa, autorizado pelo dono. Não é contato real.

**`primary_for_goal` foi reativado por engano e revertido no mesmo dia.**
Motivo: a sessão rodou sem acesso ao repositório — o HANDOFF não pôde ser lido, e
a divergência `conversions` 0 × `all_conversions` 5 foi apresentada como achado
novo quando já estava documentada em §7.1. A alteração de 05/08 (request-id
`xMbYjE0H2R9w7f6h9evw8A`) e sua reversão deliberada foram refeitas às cegas.
O risco de conta compartilhada foi levantado com o dono e autorizado, mas sem a
decisão anterior à vista. Consequência: revertido em 06/08 para *Ação secundária*,
restaurando o estado que a sessão de 05/08 deixou de propósito. **Regra reforçada:
sem `HANDOFF.md` lido, não se altera propriedade de conta compartilhada.**

**A rota cirúrgica para escopar a conversão à campanha não existe.**
Motivo: aplicar a meta personalizada `CÁSSIO | WHATSAPP | CONTRATAÇÃO DE SHOW`
só à campanha `24066140634` exigiria trocar `Meta da campanha` de `Cliques` para
`Conversões` — Demand Gen com objetivo de cliques não expõe seção de metas de
conversão. Isso é mudança de estratégia de lance, proibida pela restrição vigente,
e resetaria o aprendizado a 15 dias do fim. Consequência: em conta compartilhada,
`conversions` × `all_conversions` se resolve **no leitor, não na conta**. O monitor
deve ler `all_conversions` e segmentar por ação, conforme já manda a regra §3.4.

**Os links de WhatsApp da landing são injetados por JavaScript.**
Motivo: no HTML servido pelo servidor eles são `href="#"`, e a bolha flutuante não
existe — `assets/site.js` reescreve em runtime. Consequência: se o JS falhar ou
demorar, os botões morrem e a conversão some sem deixar rastro. Em 3G ruim é perda
silenciosa. Candidato mais plausível a explicar clique que não vira contato.
Correção proposta, não aplicada: renderizar os `wa.me` no HTML do servidor.

**O monitor mede gasto acumulado pelo período da campanha, não pela janela de 7 dias.**
Motivo: na primeira execução real ele imprimiu `restante até o teto: R$ 443,38`
somando só os últimos 7 dias contra um teto vitalício — o gasto real acumulado era
R$ 177,47 e o restante, ~R$ 295. O número errado era o sintoma menor; o grave é que
o alerta de `gasto acumulado > R$ 400` comparava janela curta com teto longo e
**nunca dispararia**. Consequência: segunda consulta usando `campaign.start_date`,
campo que só existe até a v22 — mais uma razão para a versão estar fixada. Se
`start_date` vier vazio, o monitor **alerta que está cego** em vez de imprimir
número errado. Silêncio agora significa vigilância, não ausência de dado.

**`CASSIO | LEAD QUALIFICADO | FORM` está inativo, mas a cadeia parece íntegra.**
Motivo: `site.js` empurra `form_submit` pelo mesmo helper que empurra
`whatsapp_click`, e o container `GTM-5JGMZBKZ` referencia `form_submit` no mesmo
padrão — este provado ponta a ponta. "Inativo" no Ads significa nenhuma conversão
em 30 dias. Consequência: a hipótese principal não é tag quebrada, é **ninguém
completar o formulário** — 11 campos, 5 obrigatórios, com `input[type=date]`, para
tráfego de vídeo em celular. Em 680 cliques: 5 no WhatsApp, 0 no formulário.
Não confirmado: exigiria submissão real, que geraria pedido à produção.

## 2026-08-07

- **Campanhas da Garbo reativadas com R$ 100 (Pix da Andréia).** Rateio pelas
  conversas de WhatsApp que cada uma gerou: MOVEIS R$ 6/dia, MESAS R$ 5/dia,
  PRODUTOS R$ 3/dia. CASAMENTOS e MARCA seguem pausadas. Motivo: as cinco
  produziram 29 conversas por R$ 221,60 (R$ 7,64 cada) rodando a R$ 3–12/dia —
  não estavam indo mal, estavam sem verba. Ressalva registrada: a proporção
  premia volume, não eficiência; PRODUTOS entrega a R$ 2,36 e MOVEIS a R$ 11,07.
- **Lifecycle `read_only_scope` criado.** Garbo e NovaCena entram na allowlist
  para auditoria, mas mutate é recusado. Motivo: coluna de auditoria que o
  control plane não lê é auditoria que só existe na interface; mas a restrição
  vigente é "não toque em nenhuma outra campanha", e `active_scope` abriria
  escrita de brinde.
- **Piso de R$ 1,00/dia em vez de pausa** quando o saldo do cliente acaba.
  Motivo: histórico contínuo, sem degrau de reativação. Custa até ~R$ 30/mês por
  cliente parado, do bolso do dono — float deliberado. Exceção: mais de 30 dias
  sem depósito, pausar de fato.
- **Governador de orçamento propõe, não aplica.** Decisão do dono: "me avise
  antes, me dê a sugestão correta para eu decidir, e aí aplique." Aplicar segue
  passando pelo `planCampaignBudget` com hash de aprovação.
- **Livro-caixa com três números** (`recebidoDoCliente`, `comissao`,
  `depositadoEmAds`). Motivo: só o depósito real dá pista de veiculação. Lançar
  o Pix inteiro infla os dias calculados e faz o governador liberar consumo da
  fatia de outro cliente reportando tudo verde — o número inflado engana o freio,
  não só o cliente.
- **Não migrar clientes atuais para contas separadas.** O bônus do Google é
  maior concentrando volume numa conta só, e migrar custa histórico e
  aprendizado. Decisão: cliente novo nasce em conta própria. Troca consciente de
  isolamento por bônus, registrada como tal.
- **Dependência `yaml` adicionada** para o governador ler o livro-caixa. Sem
  acesso a rede ou credencial, logo fora da regra de aprovação do CLAUDE.md.
- **Mensalidade separada; o Pix de mídia vai integralmente para anúncio.**
  Confirmado em 07/08 para o depósito de R$ 100 da Garbo (`comissao: 0.00`) e
  adotado como regra vigente. Motivo: é a estrutura em que relatório de
  veiculação e receita da agência não se misturam **por construção** — se nada
  é retido, não há como o relatório divergir do extrato do Google. `comissao`
  deve ser lançada como `0.00` explicitamente, nunca deixada `null`: ausência
  de declaração não pode ser lida como ausência de retenção, e o governador
  alerta enquanto for `null`.

## 2026-08-08 — Incidente da Garbo fechado; trava legada é a causa

**O incidente não é de acesso à conta.** O Histórico de Alterações de 07/08
parecia vazio porque a visão estava filtrada para campanhas `Ativadas`. Com o
filtro ampliado para `Todas`, apareceu a sequência: ativação manual das três
campanhas às 14:25:55 e pausa às 14:49:19 pela ferramenta `Script do Google
Ads`, sob `contato.automatizadoria@gmail.com`. Os detalhes confirmam exatamente
24016194642, 24016194645 e 24016194648. Houve o mesmo ciclo às
01:27:05/01:49:19. Consequência: a hipótese de terceiro ou acesso oculto está
descartada para este incidente.

**A causa raiz é o script `GARBO | TRAVA R$100 | 20260728` (ID `11999683`).**
Ele roda de hora em hora e ainda calcula o gasto desde `20260728`, com teto de
R$ 100 e pausa preventiva em R$ 90. O depósito novo de 07/08 foi acompanhado de
reativação e novos orçamentos, mas a janela do script não foi atualizada; o
gasto histórico já superava o gatilho e a próxima execução pausou tudo.
Consequência: não reativar novamente enquanto essa trava continuar com os
parâmetros antigos.

**O script legado e o governador não podem permanecer como autoridades
concorrentes.** O governador vigente propõe e pede aprovação; o script antigo
executava pausa automática. A decisão operacional exigia aprovação explícita e
esta ordem: neutralizar a trava, reativar, observar a próxima janela, confirmar
estado.

**A investigação foi somente leitura.** Antes da aprovação posterior, as cinco
campanhas da Garbo estavam pausadas; 24016194642/645/648 preservavam
R$ 6/R$ 5/R$ 3 por dia e tiveram R$ 0,00 em 07/08.

## 2026-08-08 — Agendamento legado removido e Garbo reativada

**Decisão aprovada pelo dono:** preservar o script
`GARBO | TRAVA R$100 | 20260728` (`11999683`) e remover somente seu agendamento
horário. A frequência foi alterada de `Por hora` para `Nenhuma`; a tabela mostra
`—`, enquanto o código e o status `Ativado` permanecem intactos. Motivo:
eliminar a autoridade automática concorrente sem apagar a evidência e o código
do lote anterior.

**Só depois da neutralização foram reativadas exatamente três campanhas:**
24016194642 a R$ 6/dia, 24016194645 a R$ 5/dia e 24016194648 a R$ 3/dia.
Recarregamento confirmou `Ativado` e os mesmos orçamentos. 24016194651 e
24016194654 continuam pausadas. A próxima conferência é somente leitura após a
antiga janela das 09:49.

**Critério dos relatórios desta operação:** o lote de R$ 100 da Andréia começa
em 07/08. `WhatsApp | GARBO` foi 0 em 07/08 e 0 em 08/08 até 09:04. Para o
relatório histórico do Cássio, usar todas as cinco campanhas do XML `Todo o
período`, inclusive o gasto do piloto sem conversão: R$ 373,63, 1.388 cliques e
14 em `WHATSAPP - CÁSSIO`, resultando em R$ 26,69 por WhatsApp. Consolidar as
cidades das duas campanhas que converteram: São Paulo 9, Goiânia 2, Brasília 2
e Rio de Janeiro 1. `Região de segmentação` não deve ser apresentada como
localização física verificada.

## 2026-08-08 — OpenClaw é opcional; priorizar a estrutura existente

**OpenClaw não é requisito.** Ele oferece canal, sessões, roteamento, automações
e aprovações genéricas, mas o dono informou que já possui banco, painel web,
GitHub, VPS, Cloudflare, n8n, Meta e infraestrutura de WhatsApp. Essa declaração
é `owner_reported` onde ainda não houver inventário técnico. Consequência: não
contar essas plataformas como inexistentes; distinguir existência de integração
com o control plane.

**Caminho recomendado enquanto o dono não decidir o contrário:**
`WhatsApp/Evolution → n8n → API do control plane → adaptadores`, com o painel
existente consumindo a mesma API. O valor deste repositório continua sendo a
política específica da operação: cliente e campanha verificados, conta
compartilhada, livro-caixa, governador, kill switch, confirmação vinculada ao
plano e auditoria.

**Não instalar OpenClaw agora.** Ele só deve ser reconsiderado se houver uma
necessidade concreta de sessões multiagente, memória ou outros canais que a
estrutura atual não atenda. Estimativa revisada: 3 dias úteis para leitura pelo
WhatsApp, 7 a 10 para Google Ads com confirmação e 10 a 15 para integrar banco,
painel e adaptadores prioritários, dependendo das credenciais e APIs existentes.
Esta decisão não autoriza escrita na VPS nem conexão de número real.

## 2026-08-08 — Credenciais entram somente por referência segura

**O pacote de integração fornecido pelo dono será separado em metadados e
segredos.** IDs de contas, URLs, nomes de instâncias, escopos, regras e mapas de
clientes podem ser documentados. Tokens, senhas, client secrets, refresh tokens,
chaves privadas e strings de conexão não serão enviados no chat nem gravados no
repositório; serão cadastrados diretamente no mecanismo protegido da plataforma
e o código receberá apenas a referência/nome da variável.

**Entregar acessos não equivale a aprovar escritas externas.** Configurar
credenciais, webhooks, VPS, n8n, Cloudflare, banco, publicação ou mensagem real
continuará sujeito a uma proposta concreta e aprovação explícita. Primeiro será
validado o menor escopo somente leitura; permissões de mutação serão habilitadas
apenas quando o fluxo de confirmação, auditoria, rollback e kill switch estiver
homologado.

## 2026-08-08 — Sessão autenticada não substitui integração programática

**Acesso visual e acesso reproduzível são estados diferentes.** Cloudflare,
Google Ads, GTM e Hostinger foram lidos nas sessões do navegador, mas isso não
transforma o control plane em operador autônomo. Para integrações novas, o
primeiro token será somente leitura e de escopo mínimo; permissões de escrita
entram em lote separado, depois de confirmação, auditoria e rollback.

Consequência imediata: GitHub, Google Ads local, `gcloud`, GTM e SSH já estão
destravados para leitura. Cloudflare está parcial sem token de API; n8n e Meta
continuam bloqueados até o dono entrar pessoalmente. Senha e 2FA nunca serão
pedidos no chat.

## 2026-08-08 — Governador usa o dia de Brasília e reconcilia pausadas

**O governador precisa confrontar tanto `campanhasAtivas` quanto
`campanhasPausadas` com a conta.** A versão anterior só consultava as declaradas
ativas; por isso MARCA e CASAMENTOS da Garbo podiam ser ativadas fora do plano
e o monitor continuar verde. A correção preserva campanhas pausadas fora do
cálculo de gasto/orçamento, mas lê seu status e acusa `ativa_sem_declaracao`.

**A data operacional é `America/Sao_Paulo`, não UTC.** GitHub Actions roda em
UTC; `toISOString()` avançava o dia às 21h de Brasília. A função agora é pura e
tem regressões cobrindo a virada.

Em 08/08 às 23:20, a leitura corrigida encontrou MARCA `24016194651` ativa a
R$ 8/dia e CASAMENTOS `24016194654` ativa a R$ 12/dia, contra a decisão vigente
de mantê-las pausadas. O achado **não autoriza correção automática**: pausar as
duas continua exigindo aprovação explícita do dono.

## 2026-08-09 — Memória e economia são isoladas por cliente

**Decisão:** cada cliente tem `clients/<slug>/memory.yaml`. Domínio,
repositório, WhatsApp, pixel/dataset, custo máximo por conversa e taxa de
conversa para contrato pertencem ao slug e nunca recebem padrão global.

**Motivo:** o custo aceitável e o valor de uma conversa variam por cliente. Um
limiar global misturaria operação comercial e poderia recomendar corte ou gasto
no cliente errado. A mesma regra vale para associação de recursos: candidato
plausível permanece `discovered`/`unknown` até confirmação.

**Mecanismo:** `npm run perguntar:cliente -- --cliente <slug>` gera apenas as
perguntas pendentes daquele cliente. Testes validam os oito arquivos e recusam
memória cujo `clientSlug` não coincide com a pasta.

## 2026-08-09 — Cloudflare programática é somente leitura e expira

**Decisão:** usar o token `automatizador-control-plane-readonly-20260808`, com
`Account Settings`, `Workers Scripts`, `Cloudflare Pages`, `Connectivity
Directory`, `Zone` e `DNS`, todos em `Read`; restrito à conta
`e6d7a4863004885bdae7e63bbec5e1f7` e com expiração em 06/11/2026.

**Armazenamento:** valor fora do Git, em arquivo local modo `600`. O repositório
guarda somente caminho e metadados não secretos. O cliente HTTP só implementa
GET; não há método de escrita. O catálogo expõe apenas
`cloudflare.zones.list` e `cloudflare.dns.list`.

**Motivo:** o inventário precisa cobrir DNS, Pages, Workers e túneis de forma
reproduzível, sem reutilizar os tokens antigos de build, que têm muitas
permissões e não possuem expiração visível.

## 2026-08-09 — Chave ampla do n8n não será criada como se fosse read-only

**Fato verificado:** no n8n 1.120.4 desta instalação, editar escopos da API key
exige upgrade. A chave disponível inclui permissões de escrita, como criar e
apagar credenciais e projetos.

**Decisão:** nenhuma chave foi criada. Continuar somente após uma destas
aprovações explícitas: chave ampla temporária, compensada por adaptador que só
chama GET e prazo curto; ou usuário PostgreSQL realmente somente leitura.

**Motivo:** chamar a credencial ampla de “chave de inventário” esconderia o
raio de dano real e violaria a regra de menor privilégio.

## 2026-08-09 — Meta entra no escopo; rotações permanecem adiadas

**Meta:** o dono confirmou que a operação cobrirá campanhas, pixels/datasets e
medição. A confirmação de escopo não autoriza mutação de campanha; cada ação
continua sujeita ao kill switch e à aprovação específica.

O seletor autenticado mostrou 19 portfólios, mas a leitura dos ativos internos
exigiu chave de acesso/biometria. Essa confirmação é pessoal do dono e não será
contornada; até lá, associações por semelhança de nome ficam `discovered` ou
`unknown` em `inventory/meta.yaml`.

**Rotações:** por decisão explícita do dono, a senha root da VPS e o TOTP
exposto da Vivere serão rotacionados somente depois dos testes e validação da
plataforma. O risco é aceito temporariamente, não resolvido.

**Buteco:** a nova mídia também foi rejeitada por direito autoral. A campanha
`24105770570` continua congelada enquanto o dono prepara a reivindicação; a
campanha `24079586567` continua removida.

**Garbo:** o dono informou que foi ele quem atualizou as campanhas ativas em
08/08 (`owner_reported`). A intenção de manter exatamente as cinco ativas ainda
aguarda resposta; nenhuma mudança de status pode ser inferida desse relato.

## 2026-08-09 — Inventário YAML precisa ser validado integralmente

**Decisão:** toda validação de lote que altere inventário deve carregar todos os
YAMLs de `clients/` e `inventory/`, não apenas os arquivos recém-modificados.

**Motivo:** a carga integral encontrou uma nota órfã em
`inventory/google-ads.yaml` e dois valores `read:org` sem aspas, em
`inventory/accounts.yaml` e `inventory/integrations.yaml`. As três correções
foram exclusivamente sintáticas e os **55 YAMLs** passaram a carregar. Um teste
verde que não abre o inventário inteiro não prova que a memória operacional é
legível.

## 2026-08-09 — Meta adiada; GitHub e VPS entram somente em leitura

**Meta:** o dono decidiu seguir o lançamento sem Meta por enquanto. Os 19
portfólios descobertos permanecem inventariados, mas a biometria e os ativos
internos deixam de bloquear a fila. Nenhum dado histórico da Meta é promovido e
nenhuma mutação fica autorizada.

**GitHub:** o Control Plane reutiliza o `gh` CLI autenticado no keychain, sem
copiar token para `.env`. O owner é fixado em `dadocruz`; o adaptador executa
somente `gh repo list`, devolve fatos da API com associação de cliente nula e
não oferece criar, editar, arquivar ou apagar.

**VPS:** o adaptador aceita somente três operações tipadas, ligadas a comandos
fixos: saúde do host, `docker ps -a` com projeção explícita e
`docker stack ls`. Não existe método para texto arbitrário, `inspect`, `exec`,
reinício ou remoção. O acesso subjacente ainda é root até o usuário operacional
ser aprovado; a lista branca no cliente reduz superfície, mas não elimina esse
risco de credencial.

## 2026-08-09 — Relatório do Cássio separa microconversão de conversa

**Decisão:** o relatório histórico conta somente a ação verificada
`WHATSAPP - CÁSSIO` em `all_conversions`, nas cinco campanhas explicitamente
associadas ao cliente. “Clique no WhatsApp” será chamado de microconversão e
nunca de conversa, lead ou contrato.

**Cidade:** usar `geographic_view` com `segments.geo_target_city`, local de
presença, e resolver o ID pela fonte `geo_target_constant`. Não reutilizar
região de segmentação como se fosse cidade da conversão.

**Custo:** apresentar duas bases: R$ 18,45 por WhatsApp nas campanhas Demand
Gen que geraram a ação; R$ 20,33 incluindo o piloto Search que gastou R$ 37,60
e gerou zero WhatsApp. O XML com 14 registros é fotografia anterior; a API ao
vivo de 09/08 registrou 20. O relatório não autoriza envio ao cliente.

## 2026-08-09 — Garbo fica com as cinco campanhas ativas

**Decisão do dono:** manter exatamente como ele configurou pessoalmente:
MOVEIS R$ 6/dia, MESAS R$ 5/dia, PRODUTOS R$ 3/dia, MARCA R$ 8/dia e
CASAMENTOS R$ 12/dia, total nominal de R$ 34/dia.

Esta decisão substitui, apenas para o estado pretendido atual, a decisão de
07/08 que mantinha MARCA e CASAMENTOS pausadas. O livro-caixa foi reconciliado;
nenhuma chamada de escrita foi feita ao Google Ads. Garbo continua em
`read_only_scope`, portanto a confirmação não concede escrita futura nem
reativação automática.

Após a reconciliação, o governador leu as cinco como `ENABLED` nos valores
declarados, sem divergência. Com R$ 11,27 já reportados e uma diária ainda não
vista estimada em R$ 34, restaram R$ 54,73 seguros — cerca de 1,6 dia.

## 2026-08-09 — n8n usa chave temporária ampla com cliente GET-only

**Decisão do dono:** autorizar a chave ampla exigida pelo plano atual do n8n.
A chave `automatizador-control-plane-temporaria-20260809` expira em 16/08/2026
e fica fora do Git, em arquivo local modo `600`.

**Contenção compensatória:** `N8nReadClient` só implementa HTTP GET e reduz as
respostas a metadados antes de devolvê-las. Não existem métodos de criar,
editar, ativar, desativar ou apagar workflow. O inventário nunca publica nós,
parâmetros, conexões, dados fixados, webhooks ou valores de credenciais.

A API confirmou 33 workflows, 1 ativo, 32 inativos e 3 arquivados. A interface
mostra 30 porque omite os arquivados. Todas as associações a cliente permanecem
`unknown`; nome ou tag não são prova. `GET /api/v1/credentials` respondeu 405,
portanto o inventário de credenciais é indisponível — não uma lista vazia.
