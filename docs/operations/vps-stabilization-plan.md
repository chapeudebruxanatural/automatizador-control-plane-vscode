# Plano de estabilização da VPS

Data: 2026-08-05 · Riscos: [`docs/discovery/vps-risk-review.md`](../discovery/vps-risk-review.md)

**Nenhuma ação deste plano foi executada.** Todas exigem aprovação.

## Ordem

A ordem não é por severidade. É por **dependência**: cada bloco torna o
seguinte mais seguro de executar.

---

## Bloco 0 — Descobrir antes de agir (Nível 0/1)

Nada aqui altera estado, e tudo aqui muda o que fazer depois.

| # | Ação | Por quê primeiro |
|---|---|---|
| 0.1 | **Confirmar as montagens do `novacena-motion`** | Decide se o único backup existente protege alguma coisa (R-002). Exige `docker service inspect`, Nível 1 |
| 0.2 | **Restaurar um `tar.gz` do S3 em diretório isolado** | Prova se o backup atual é restaurável. Barato e nunca foi feito |
| 0.3 | Comparar os dois volumes do `novacena-music` | Decide se os 766 MB órfãos importam (R-007) |
| 0.4 | Localizar o código de `novacena-editais` e `novacena-propostas` | Hoje podem existir só dentro de imagens Docker |
| 0.5 | Verificar firewall externo no painel da Hostinger | Decide a urgência de R-003 |

**0.1 e 0.2 são os itens de maior valor do plano inteiro.** Juntos respondem:
"se a VPS morrer agora, o que sobrevive?" — que hoje ninguém sabe.

---

## Bloco 1 — Fechar a lacuna de backup (Nível 1/2)

| # | Ação | Nível | Rollback |
|---|---|---|---|
| 1.1 | Corrigir a origem do backup, se 0.1 confirmar R-002 | 2 | trivial |
| 1.2 | Instalar `backup-postgres.sh` na VPS | 2 | remover o arquivo |
| 1.3 | Rodar `--apply` uma vez, manualmente, e verificar checksum | 2 | nenhum efeito colateral |
| 1.4 | **Restaurar o dump em container isolado** | 1 | container descartável |
| 1.5 | Enviar ao S3 já autorizado, sob prefixo separado | 2 | apagar o objeto |
| 1.6 | Agendar por timer systemd, no padrão existente | 2 | desabilitar o timer |
| 1.7 | Estender a `backup-volumes.sh` e `backup-configs.sh` | 2 | idem |

**1.4 é obrigatório antes de 1.6.** Agendar backup não verificado é agendar a
ilusão de estar protegido.

Destino: o bucket S3 **já em uso** pelo `novacena-backup`. Não introduz serviço
novo nem novo terceiro — é o caminho de menor atrito de autorização.

---

## Bloco 2 — Preservar a capacidade de voltar atrás (Nível 2)

| # | Ação | Nível |
|---|---|---|
| 2.1 | Rodar o simulador de retenção após um deploy real | 0 |
| 2.2 | Instalar retenção em modo relatório | 2 |
| 2.3 | Substituir as duas entradas de cron | 2 |

Ver [`docker-retention-policy.md`](docker-retention-policy.md).

---

## Bloco 3 — Reduzir superfície (Nível 2)

| # | Ação | Rollback |
|---|---|---|
| 3.1 | Restringir 2377/7946/4789 ao loopback ou rede privada | sim, regra reversível |
| 3.2 | Rotacionar o segredo do arquivo em `/root` e removê-lo | rotacionar é irreversível por desenho |
| 3.3 | Criar usuário operacional não-root | sim |
| 3.4 | Desligar o `novacena-music` Compose, **após 0.3** | sim, `docker compose up -d` |
| 3.5 | Encerrar `determined_neumann`, após descobrir o propósito | parcial |
| 3.6 | Remover ou documentar o `nginx.service` falhado | sim |

3.2 primeiro rotaciona, depois apaga. Nunca o contrário.

---

## Bloco 4 — Dívida de plataforma (Nível 2, com janela)

| # | Ação | Observação |
|---|---|---|
| 4.1 | Reboot em janela combinada | 193 dias; correções de kernel não estão em memória |
| 4.2 | Versionar os manifestos sanitizados | `backup-configs.sh` já faz a sanitização |
| 4.3 | Planejar migração do Debian 11 | 13 stacks dependem do host |
| 4.4 | Atualizar MinIO (imagem de jan/2024) | |
| 4.5 | Fixar versão do n8n em vez de `latest` | evita 8 meses de mudança de uma vez |

4.1 é pré-requisito de 4.3: se o host não sobrevive a um reboot planejado, não
vai sobreviver a uma migração.

---

## O que **não** fazer

**Não desligue a poda sem substituto.** Há folga (59 GB livres), mas o
crescimento não é monitorado.

**Não mexa no `novacena-autodeploy`.** É mais maduro do que parecia: pull-based,
com lock e rollback. Resolve um problema real de timeout de SSH no CI.

**Não altere nada antes do Bloco 0.** Metade das ações depende do que 0.1 e 0.3
revelarem.

**Não trate `novacena-backup` como redundante.** Ele funciona, tem retenção
testada e destino externo. O que falta é escopo, não substituição.

---

## Resumo de esforço

| Bloco | Ações | Nível máximo | Ganho |
|---|---|---|---|
| 0 — Descobrir | 5 | 1 | Responde "o que sobrevive?" |
| 1 — Backup | 7 | 2 | Torna todo erro reversível |
| 2 — Rollback | 3 | 2 | Recupera o rollback de deploy |
| 3 — Superfície | 6 | 2 | Reduz raio de incidente |
| 4 — Plataforma | 5 | 2 | Remove dívida estrutural |

**Se só houver energia para uma coisa: itens 0.1 e 0.2.** Custam uma sessão
curta, não alteram nada, e definem se a operação está protegida ou apenas
parece estar.
