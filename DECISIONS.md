# DECISIONS

Registro cronológico de decisões. Decisões arquiteturais extensas ganham um ADR
em `docs/adr/` e aparecem aqui como uma linha com link.

Formato: **data — decisão** · motivo · consequência.

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
