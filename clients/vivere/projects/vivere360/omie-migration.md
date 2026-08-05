# VIVERE 360 — migração do Omie

Data: 2026-08-05 · Fonte: nomes de arquivo e estrutura do repositório, sem
leitura de conteúdo.

## O que existe

41 arquivos relacionados a Omie no repositório, incluindo três documentos de
planejamento que sugerem processo formal:

| Documento | Papel provável |
|---|---|
| `docs/MATRIZ_PARIDADE_OMIE.md` | O que o novo sistema precisa cobrir para substituir o Omie sem perda de função |
| `docs/PLANO_TRANSICAO_OMIE_VIVERE360.md` | Sequência e estratégia da migração |
| `docs/CHECKLIST_TIAGO_CUTOVER_OMIE.md` | Lista de verificação para o corte final, com nome do responsável |

O nome do terceiro documento é o dado mais informativo aqui: um checklist com
nome de pessoa nomeada sugere processo de corte planejado, não uma migração
"big bang" sem preparação. Isso é sinal positivo de maturidade — mas é
inferência da estrutura, não confirmação de conteúdo.

## Código relacionado

```
src/app/api/automation/omie-sync/route.ts
src/app/api/integrations/omie/status/route.ts
src/app/api/integrations/omie/sync/route.ts
scripts/test-omie-csv.mjs
```

Padrão consistente com Promob e AC Ponto: `status`, `sync`, mais um script de
teste específico (`test-omie-csv.mjs`), o que sugere que parte dos dados migra
via CSV, não apenas via API.

## Módulos que dependem do Omie

`financeiro` e `fiscal` — os dois módulos mais sensíveis a erro de migração,
porque erro ali é divergência de dinheiro ou de obrigação tributária.

## Por que isso importa para este Control Plane

Nenhuma ação direta é necessária daqui. Mas o registro serve para:

1. **Não presumir que o Vivere já não usa Omie.** A migração está em
   andamento, não concluída — tratar como concluída seria erro de estado.
2. **Sinalizar risco em qualquer futura integração de Google Ads ou automação**
   que dependa de dados financeiros do Vivere: enquanto a migração não fechar,
   a fonte de verdade financeira pode estar dividida entre dois sistemas.

## O que não foi verificado

- Conteúdo da matriz de paridade, do plano de transição, ou do checklist
- Se há data-alvo de cutover
- Se a migração está em dia, atrasada ou pausada
- Volume de dados já migrados

## Estado

`em migração` — declarado pela evidência estrutural, não por confirmação
direta do dono ou de Tiago Facanali. `verificationStatus: verified` para a
**existência** do trabalho de migração; `unknown` para seu **progresso**.
