# VIVERE 360 — homologação

Data: 2026-08-05 · Nenhum ambiente foi acessado.

## Ambiente

| | |
|---|---|
| URL | `vivere-homologacao.estudionovacena.workers.dev` |
| Worker | `vivere-homologacao` |
| Plataforma | Cloudflare Workers |
| Status ao vivo | não verificado |

## Por que homologação importa mais que o normal neste projeto

O trabalho recente é especificamente sensível a erro:

1. **Leitura de folha de ponto manuscrita por IA** — se a IA lê mal um número,
   o erro só aparece no pagamento.
2. **Casamento de funcionário pelo registro do AFD** — associação errada
   atribui hora trabalhada à pessoa errada.
3. **Migração do Omie** — divergência entre sistemas durante a transição é o
   tipo de bug que só aparece na reconciliação financeira, semanas depois.

Nenhum desses três admite "testar em produção e corrigir depois". O custo de
um erro é financeiro e trabalhista, não apenas técnico.

## Estado declarado

O handoff original registra explicitamente: **"não homologado com dados
reais"** para a leitura de folha manuscrita por IA. Isso é a informação mais
importante deste documento — o recurso existe no código, mas ainda não foi
validado contra o caso real que ele precisa resolver.

## O que "homologar" deveria significar aqui

Não apenas "rodar sem erro". Para os três itens sensíveis:

- **Leitura de folha manuscrita:** testar contra fotos reais (ou realistas) de
  folhas manuscritas, com revisão humana comparando resultado da IA contra
  leitura humana, medindo taxa de erro antes de confiar sem revisão.
- **Casamento por AFD:** testar contra um arquivo AFD real, confirmando que
  cada funcionário é associado ao registro certo — inclusive nos casos
  ambíguos (nomes parecidos, funcionário sem registro).
- **Migração Omie:** ver [`omie-migration.md`](omie-migration.md) para o
  checklist de cutover já existente no repositório do cliente.

## O que este Control Plane não fez

- Não acessou a URL de homologação
- Não testou nenhuma funcionalidade
- Não confirmou se o ambiente está no ar
- Não leu o handoff original na íntegra

## Próximo passo

Esse trabalho de homologação é do time do Vivere / Tiago Facanali, não deste
Control Plane. O papel daqui é garantir que o **registro** da pendência não se
perca — este documento existe para isso.
