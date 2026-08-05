# AutomatizadorIA — contexto operacional

Última revisão: 2026-08-04 · Procedência: `owner_reported` + `discovered`

## O que é

Operação de automação e IA aplicada a negócios, conduzida por **Dado Cruz**.
Entrega sites, automações e gestão de tráfego para uma carteira pequena de
clientes, em sua maioria do setor de eventos, música e produção cultural.

Duas marcas convivem sob a mesma pessoa:

- **AutomatizadorIA** — a operação de serviços. Conta Google canônica:
  `contato.automatizadoria@gmail.com`.
- **Novacena** — produção audiovisual e musical própria. Conta Google separada:
  `estudionovacena@gmail.com`.

Essa separação é **regra**, não convenção. Não se misturam arquivos, e-mails,
agendas, contatos ou recursos entre as duas. Ver
[access-matrix](../docs/security/access-matrix.md).

## Como a operação está montada hoje

**Uma pessoa, um GitHub, uma VPS.** Todos os 14 repositórios estão sob a conta
`dadocruz`. A infraestrutura de produção é uma VPS Hostinger (`nvvps`) rodando
Docker. Não há redundância de acesso: se o dono ficar indisponível, a operação
inteira fica.

**Sites estáticos na borda, aplicações na VPS.** A maioria dos projetos de
cliente é site estático publicado na Cloudflare (indícios: `_headers`,
`_redirects`, `wrangler.toml`). O que precisa de processo — n8n, aplicações —
roda em container na VPS.

**Automação concentrada no n8n.** É o orquestrador de fato dos processos.
Também é o maior ponto cego: o que cada workflow faz não está documentado em
lugar nenhum fora do próprio n8n.

**Tráfego pago pela Meta.** Oito contas de anúncios, das quais apenas duas estão
ativas e consultáveis. As outras seis estão desabilitadas por revisão de
segurança ou com pendência financeira.

## O que caracteriza esta operação

**Velocidade acima de processo.** Os repositórios mostram entregas rápidas, com
arquivos de instrução do tipo `COMO_APLICAR_FINAL.md` e `ENTREGA-GPT.md` na
raiz. Funciona para entregar; não funciona para operar em escala nem para
transferir conhecimento.

**Conhecimento não escrito.** Cinco dos catorze repositórios não têm cliente
identificável. Dois clientes declarados não têm nenhum recurso rastreável. Isso
não é desleixo — é o custo natural de crescer em ferramentas mais rápido do que
em coordenação. É exatamente o que o Control Plane existe para corrigir.

**Uso intenso de agentes de IA.** Vários repositórios têm `CLAUDE.md` e
`AGENTS.md` próprios, e há workflows que aplicam correções automaticamente.
Isso amplifica tanto a produtividade quanto o raio de um erro — e é a razão de
o kill switch existir ([ADR 0002](../docs/adr/0002-kill-switch-por-padrao.md)).

## Fronteiras que não se cruzam

1. **Contas Google.** AutomatizadorIA e Novacena, sempre separadas.
2. **Repositórios de cliente.** O Control Plane lê; não escreve.
3. **Produção.** Leitura livre, escrita sob aprovação específica.
4. **WhatsApp.** Desligado nesta fase. É o único canal que fala direto com o
   cliente final; erro ali é público e irreversível.

## Riscos estruturais

| Risco | Por que importa |
|---|---|
| Acesso concentrado em uma pessoa | Sem plano de continuidade, indisponibilidade do dono para a operação |
| n8n não documentado | Processos de cliente dependem de workflows que ninguém mais entende |
| 6 de 8 contas Meta restritas | Limita a entrega de tráfego, que é serviço vendido |
| Repositórios públicos com artefato de produção | Expõe topologia de deploy sem necessidade |
| Dois clientes sem recurso rastreável | Trabalho possivelmente sem backup e sem versionamento |

## O que o Control Plane muda

Primeiro, **saber o que existe** — inventário com procedência explícita.
Depois, **agir com freio** — kill switch, aprovação e auditoria.
Só então, **automatizar de verdade** — e apenas o que já foi entendido.

A ordem não é negociável. Automatizar o desconhecido multiplica o desconhecido.
