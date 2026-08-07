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
