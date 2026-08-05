# Vivere — backlog

O que se sabe estar pendente, por prioridade. Nenhum item aqui foi executado
por este Control Plane.

## Bloqueadores

| # | Item | Por quê primeiro |
|---|---|---|
| 1 | Resolver o incidente do TOTP exposto | Segurança de conta em uso; ver `security.yaml` |
| 2 | Confirmar credencial `ANTHROPIC_API_KEY` disponível | Sem ela, a leitura de folha manual por IA não roda |
| 3 | Homologar a leitura de folha manuscrita com dados reais | Feature implementada mas não validada |

## Módulo RH / Ponto — trabalho recente

Sequência de commits mostra desenvolvimento ativo:

1. Fechamento de ponto com AFD do relógio + folha manual + planilha do contador
2. Relatório separado de horas para funcionários sem registro no contador
3. Revincular funcionário ao AFD já importado, sem reenviar o arquivo
4. **Atual:** casar funcionário pelo registro do AFD e ler folha manual por
   foto, com IA

Ver [`projects/vivere360/rh-timesheet.md`](projects/vivere360/rh-timesheet.md)
para o detalhe técnico do que existe.

## Migração Omie

Documentação extensa já existe no repositório (matriz de paridade, plano de
transição, checklist de cutover). Estado de execução não verificado por este
processo.

Ver [`projects/vivere360/omie-migration.md`](projects/vivere360/omie-migration.md).

## Perguntas abertas que bloqueiam decisão

- Qual é o papel exato de Tiago Facanali (decisor ou operador)?
- `gestao.viveremp.com` reflete `main` ou a branch de trabalho?
- Existe processo formal de aprovação de deploy do lado do cliente?
- A migração do Omie tem data-alvo de cutover?

## Fora de escopo deste Control Plane

- Qualquer alteração de código no repositório `vivere`
- Qualquer deploy, merge ou checkout destrutivo
- Leitura de conteúdo de arquivo além de nome e estrutura
- Revogação do fator MFA sem decisão humana explícita
