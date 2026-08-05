# ADR 0003 — Procedência explícita em todo dado de inventário

- **Status:** aceito
- **Data:** 2026-08-04

## Contexto

O inventário inicial mistura fontes de confiabilidade muito diferentes:

- **Fato verificado por API** — `gh repo list` diz que `vivere` é privado e
  escrito em TypeScript. Isso é verdade no instante da consulta.
- **Declaração do dono** — a lista de clientes veio de quem opera o negócio.
  Confiável, mas não checada contra sistema nenhum.
- **Inferência** — o repositório `cassio-ferraz` provavelmente pertence ao
  cliente Cássio Ferraz porque o nome coincide. Provavelmente.

Sem marcar a diferença, tudo vira "o inventário diz". Três meses depois ninguém
lembra que aquela associação era um palpite. Um agente lê o YAML, trata como
verdade, e age.

A inferência por nome é particularmente traiçoeira porque acerta quase sempre —
e o "quase" é onde mora o incidente.

## Decisão

Todo registro de inventário e todo perfil de cliente carrega dois campos
obrigatórios:

- `verificationStatus` — a procedência da informação;
- `lastVerifiedAt` — quando foi checada pela última vez.

Valores permitidos:

| Valor | Significado |
|---|---|
| `owner_reported` | O dono afirmou. Não foi checado contra sistema. |
| `discovered` | Obtido de sistema, mas a interpretação é inferida (ex.: nome sugere cliente). |
| `verified` | Confirmado contra a fonte autoritativa. |
| `conflicting` | Duas fontes discordam. Exige resolução humana. |
| `stale` | Já foi verificado, mas passou tempo demais para confiar. |
| `unknown` | Não se sabe. É uma resposta legítima. |

**Regra que dá sentido ao resto:** nada é promovido a `verified` por inferência,
por plausibilidade ou por repetição. Só por checagem contra a fonte.

## Alternativas consideradas

**Registrar só o que é certo.** Rejeitada. Descartaria a maior parte do
conhecimento útil. Saber que um repositório *provavelmente* é de um cliente vale
muito — desde que esteja marcado como provável.

**Campo booleano `verified: true/false`.** Rejeitada. Perde a distinção entre
"não checado", "conflitante" e "desconhecido", que pedem ações diferentes:
checar, resolver, investigar.

**Comentário em texto livre.** Rejeitada. Não é consultável nem validável.

## Consequências

**Positivas.** É possível perguntar ao inventário o que ele não sabe — filtrar
por `unknown` e `conflicting` gera a fila de trabalho de descoberta
automaticamente. Agentes podem exigir `verified` antes de agir sobre um recurso.
Dados envelhecidos ficam visíveis via `lastVerifiedAt` em vez de apodrecerem em
silêncio.

**Negativas.** Mais campos para preencher e manter. Um `lastVerifiedAt` que
ninguém atualiza é pior que nenhum, porque simula frescor.

**Mitigação.** Marcar como `stale` é sempre preferível a deixar uma data antiga
posando de atual. A rotina de descoberta deve rebaixar registros vencidos.

## Aplicação

Vale para `clients/**/profile.yaml`, `clients/index.yaml` e todos os arquivos de
`inventory/`. O tipo `VerificationStatus` em `packages/domain` espelha esses
valores em código, e é coberto por teste.
