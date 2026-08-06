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
