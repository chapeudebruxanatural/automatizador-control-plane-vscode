# VIVERE 360 — arquitetura

Data: 2026-08-05 · Fonte: metadados do repositório (`package.json`, árvore de
arquivos), sem leitura de código-fonte além de nomes e estrutura.

> Este documento descreve o que é observável de fora. Não substitui a
> documentação interna do próprio repositório (`docs/` do `vivere`).

## Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js | 16.2.11 |
| UI | React | 19.2.4 |
| Banco de dados | Supabase (PostgreSQL gerenciado) | — |
| Hospedagem | Cloudflare Workers | via `@opennextjs/cloudflare` ^1.20.1 |

Confirmado via `package.json` da branch `feat/substituicao-omie-completa-v1`.

## Formato

Aplicação Next.js monolítica com App Router (`src/app/`), banco gerenciado
externo (Supabase) e deploy em borda (Cloudflare Workers via adaptador
OpenNext). Não há microsserviços observados — a superfície de API vive dentro
do próprio Next.js, em `src/app/api/`.

## Domínios funcionais observados

A partir dos caminhos em `src/app/`:

```
(site)  api  apresentacao  ativar-conta  auth  conteudo  entrar  gestao
seguranca  sincronizacao-inicial
```

`gestao/` concentra o ERP propriamente dito; `(site)`, `apresentacao` e
`conteudo` são a face pública/institucional; `auth`, `entrar`, `ativar-conta`
e `seguranca` formam a camada de identidade — coerente com o incidente de MFA
registrado em `security.yaml`.

## Integrações externas, por padrão de código

Cada integração segue uma estrutura repetida — `status`, `sync`,
`test-connection` — o que sugere um padrão de adaptador comum a todas:

```
src/app/api/integrations/<nome>/status/route.ts
src/app/api/integrations/<nome>/sync/route.ts
src/app/api/integrations/<nome>/test-connection/route.ts
```

Observado para **Omie**, **Promob** e **AC Ponto**. `Promob` tem adicionalmente
um `webhook/route.ts` — é a única das três que recebe evento externo, em vez de
apenas ser consultada.

## Persistência

57 migrations em `supabase/migrations/`. Duas recentes e específicas do
trabalho atual:

- `0056_timesheet_closing.sql`
- `0057_timesheet_unregistered_report.sql`

O volume de migrations (57) para um projeto com 383 commits à frente da main
sugere schema em evolução constante junto com a lógica de negócio — não uma
migração de banco isolada de uma vez.

## RH / Ponto — módulo em foco

`src/features/rh/afd-parser.ts` existe: há um parser dedicado ao formato AFD
(Arquivo Fonte de Dados, padrão da Portaria 1510/671 do eSocial para relógios
de ponto). Isso é consistente com o commit mais recente ("casar funcionário
pelo registro do AFD").

Componente de UI dedicado:
`src/components/gestao/rh/timesheet-closing-panel.tsx` — indica que o
fechamento de ponto tem uma tela própria, não é apenas processamento em
segundo plano.

Ver [`rh-timesheet.md`](rh-timesheet.md) para o detalhe funcional.

## O que não foi verificado

- Conteúdo de qualquer arquivo além do que o nome revela
- Se há testes automatizados e sua cobertura
- Convenções internas de código (lint, tipos, padrões de commit além do que se
  observa nas mensagens)
- Se a aplicação em `gestao.viveremp.com` corresponde a este código no branch
  main, na branch de trabalho, ou a nenhuma das duas

## Limite desta análise

Feita inteiramente por metadados do GitHub — nomes de arquivo, estrutura de
diretório, `package.json`, mensagens de commit. **Nenhum arquivo de código foi
lido.** É suficiente para catalogar o projeto; não é suficiente para revisar
sua qualidade, segurança de implementação ou corretude funcional.
