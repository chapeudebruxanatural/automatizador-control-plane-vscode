# Política de retenção de imagens Docker

Data: 2026-08-05 · Inventário: [`inventory/retention-jobs.yaml`](../../inventory/retention-jobs.yaml)

**Nada foi alterado.** Substituir o cron exige aprovação de Nível 2.

## Situação atual

Duas configurações independentes que se ignoram:

| Origem | Horário | Comando | Log |
|---|---|---|---|
| `crontab -l` (root) | 03:30 | `docker image prune -af` | `/var/log/novacena-docker-prune.log` |
| `/etc/cron.d/docker-image-prune` | 00:23 | `docker image prune -af --filter "until=24h"` | `/dev/null` |
| `crontab -l` (root) | 03:45 | `docker container prune -f` | log |
| `crontab -l` (root) | 04:00 | `docker builder prune -af` | log |

Corrigir apenas uma e achar que resolveu é o erro mais provável aqui.

## O problema

`-a` remove imagens **tagueadas** sem container ativo, não apenas as sem tag.

A VPS roda `novacena-autodeploy.timer` a cada 2 minutos, que faz
`docker service update` com `--rollback` automático em caso de falha. **Esse
rollback depende da imagem anterior existir localmente.**

Sequência do dano: deploy às 03:00 → imagem anterior fica sem container →
prune às 03:30 remove → às 04:00 descobre-se o problema → não há para onde
voltar.

## Medição real

`docker system df` reporta 24 imagens, **24 ativas**, 736 MB recuperáveis (4%).
O log confirma: `Total reclaimed space: 0B` em todas as execuções recentes.

A simulação da política proposta (`scripts/docker-retention-dry-run.sh`)
concorda: **zero imagens a remover hoje**.

**Leitura correta:** o risco não está adormecido porque a política é boa. Está
adormecido porque ninguém fez deploy perto de uma janela de poda. Isso não é
uma salvaguarda — é sorte com prazo de validade.

## Política proposta

1. **Nunca remover imagem em uso.** Determinado pela contagem de containers por
   `IMAGE ID` em `docker system df -v`.
2. **Preservar as 2 mais recentes por repositório** — garante alvo de rollback.
3. **Remover apenas sem tag e sem uso**, com mais de 30 dias.
4. **Relatar antes de remover**, com log real (nunca `/dev/null`).
5. **Consolidar** as duas configurações em uma.
6. **Exigir aprovação** para a remoção efetiva.

### Uma armadilha que custou uma correção

A primeira versão do simulador determinava uso por `docker ps --format
"{{.Image}}"`. Contra a VPS real, ela recomendou remover `n8nio/n8n:<none>` —
uma imagem com **três containers em execução**.

Causa: `docker ps` reporta a referência com que o container **foi criado**.
Quando a tag é movida ou removida depois, o container segue reportando
`n8nio/n8n:latest` enquanto a imagem passou a figurar como `<none>`. Comparar
por referência marcou como órfã uma imagem viva.

A correção usa a contagem de containers por `IMAGE ID`, que não depende de tag.
O simulador agora **aborta** se não conseguir determinar o uso, em vez de
assumir que nada está em uso — falhar fechado.

Qualquer substituição do cron precisa herdar essa lição. Um `prune` que decide
por tag pode apagar produção.

## Ferramentas

```bash
scripts/docker-retention-report.sh nvvps
```

```bash
scripts/docker-retention-dry-run.sh nvvps
```

Nenhum dos dois tem `--apply`. A ausência é deliberada.

## Migração proposta

| Passo | Ação | Nível |
|---|---|---|
| 1 | Rodar o simulador semanalmente por 2 semanas | 0 |
| 2 | Rodar logo após um deploy, confirmando que a imagem anterior é preservada | 0 |
| 3 | Escrever o script de retenção definitivo | 1 |
| 4 | Instalar em modo relatório na VPS, sem remover | 2 |
| 5 | Observar 1 semana | 0 |
| 6 | Substituir as duas entradas de cron | 2 |
| 7 | Manter `builder prune` (só cache) e `container prune` | — |

O passo 2 é o que valida a política, porque é exatamente o cenário que a atual
não cobre.

## Risco de desativar sem substituir

Disco em 38% (36 GB de 99 GB), 59 GB livres, imagens somando 17,2 GB. Desligar
a poda sem substituto faria o disco crescer, mas há folga confortável para uma
transição de semanas — não é motivo para adiar.
