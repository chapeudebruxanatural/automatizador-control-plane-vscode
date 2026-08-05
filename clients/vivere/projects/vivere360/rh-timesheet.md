# VIVERE 360 — RH e fechamento de ponto

Data: 2026-08-05 · Fonte: mensagens de commit, nomes de arquivo, migrations.
Nenhum conteúdo de arquivo foi lido.

## Por que este documento existe separado

É a área de trabalho mais recente e ativa do projeto: 4 dos últimos 5 commits
da branch de trabalho são deste módulo. Merece registro específico.

## Linha do tempo reconstruída (mais antigo → mais recente)

| Commit | O que fez |
|---|---|
| `c607070` | Fechamento de ponto com AFD do relógio + folha manual + planilha do contador |
| `7ad842a` | Relatório separado de horas para funcionários sem registro no contador |
| `ecb65e0` | Revincular funcionário ao AFD já importado, sem reenviar o arquivo |
| `9c94469` (HEAD) | Casar funcionário pelo registro do AFD e ler folha manual por foto, com IA |

A progressão faz sentido como iteração: primeiro o fechamento básico
(combinando três fontes — relógio, manual, contador), depois um relatório para
o caso de exceção (funcionário sem registro no contador), depois uma correção
de fluxo (revincular sem reenviar), e por fim a automação da parte mais
trabalhosa manualmente — casar funcionário e ler foto.

## Três fontes de dados de ponto

1. **AFD do relógio** — arquivo padrão (Portaria 1510/671, eSocial) exportado
   do relógio de ponto físico ou do AC Ponto.
2. **Folha manual** — quando o funcionário não bate ponto no relógio (visita
   externa, exceção), o registro é manuscrito.
3. **Planilha do contador** — provavelmente a fonte de referência para
   conciliação ou para folha de pagamento.

O sistema busca casar as três. É reconciliação de múltiplas fontes, que é
estruturalmente propenso a caso de borda: funcionário com nome parecido a
outro, registro duplicado, funcionário sem nenhuma das três fontes.

## O componente novo: leitura de folha manual por IA

**O que faz, pela mensagem do commit:** interpreta uma foto de folha de ponto
manuscrita e extrai os dados, usando a API da Anthropic
(`@anthropic-ai/sdk@^0.115.0`, adicionada nesta mesma leva de trabalho).

**Por que isso é sensível:** entrada manuscrita é ambígua por natureza —
caligrafia, borrão, número mal formado. Uma IA que lê "8" onde estava escrito
"3" produz um registro de ponto incorreto, que vira folha de pagamento
incorreta se não for pega antes.

**A salvaguarda declarada:** revisão humana obrigatória antes do lançamento. É
o desenho correto para este tipo de risco — a IA acelera a transcrição, o
humano confirma antes de qualquer efeito no pagamento.

**O que falta:** homologação com dados reais (ver `homologation.md`) e
confirmação de que a credencial `ANTHROPIC_API_KEY` está configurada e ativa
(ver `pending-dependencies.yaml`).

## Estrutura de código observada

```
src/features/rh/afd-parser.ts                              # parser do formato AFD
src/app/api/rh/employees/route.ts                           # CRUD de funcionários
src/app/api/rh/employees/upsert/route.ts                    # criação/atualização
src/components/gestao/rh/timesheet-closing-panel.tsx        # UI de fechamento
src/features/integrations/acponto/{access,client,normalizer,services,types}.ts
supabase/migrations/0056_timesheet_closing.sql
supabase/migrations/0057_timesheet_unregistered_report.sql
```

O AC Ponto tem camada de integração completa e madura (5 arquivos, com
`normalizer` dedicado — sinal de que os dados do relógio físico chegam em
formato que precisa de tratamento antes de entrar no domínio da aplicação).

## Riscos deste módulo especificamente

| Risco | Por quê |
|---|---|
| Erro de leitura por IA sem revisão consistente | Impacto direto em folha de pagamento |
| Casamento incorreto de funcionário por AFD | Hora atribuída à pessoa errada |
| Divergência entre as três fontes não resolvida | Sistema precisa de regra clara de desempate |
| Ainda não homologado com dados reais | Todo o acima é risco teórico até validação |

## O que este Control Plane não fez

Não leu o conteúdo de `afd-parser.ts` nem de nenhum outro arquivo. Não testou
a leitura por IA. Não verificou se a revisão humana está de fato implementada
como trava obrigatória no fluxo, ou apenas como recomendação de processo.

**Essa distinção importa e não foi resolvida:** "revisão humana obrigatória"
pode significar um botão de aprovação que bloqueia o lançamento, ou pode
significar apenas uma instrução no manual do usuário. São coisas muito
diferentes em termos de garantia real.
