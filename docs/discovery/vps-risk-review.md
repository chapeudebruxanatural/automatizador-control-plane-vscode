# Revisão de risco da VPS

- **Data:** 2026-08-05
- **Método:** `scripts/collect-vps-risk-review.sh` — somente leitura, com guarda
  que recusa comandos mutantes em tempo de execução
- **Alterações realizadas:** **nenhuma**

> Documento sanitizado. Sem IP, sem variáveis de ambiente, sem credenciais.
> Nenhum arquivo de segredo foi aberto.

---

## Correção de um achado do ciclo anterior

O Ciclo 1 registrou o achado **V-004 — "sem backup verificado"**. Estava
**parcialmente errado**, e a correção importa.

**Existe backup externo, automatizado e funcionando.** `novacena-backup.timer`
roda diariamente às 04:15, executa `/usr/local/bin/novacena-backup.sh`, envia
para **S3 na AWS** (`us-east-1`), aplica retenção de 30 dias e concluiu com
sucesso na última execução.

O erro do Ciclo 1 foi olhar `/root/backups` e `/var/backups` e concluir pela
ausência. O backup real usa systemd timer, não cron, e destino externo, não
disco local. Foi uma inferência a partir de evidência incompleta — exatamente o
tipo de erro que o campo `verificationStatus` existe para evitar.

**Mas o achado não desaparece: ele muda de forma, e piora.** Ver R-001 e R-002.

---

## 1. Espaço e crescimento

| Item | Valor |
|---|---|
| Disco raiz | 99 GB, 36 GB usados (**38%**), 59 GB livres |
| Inodes | 16% usados — sem risco |
| Docker: imagens | 24 imagens, 17,2 GB (736 MB recuperáveis, 4%) |
| Docker: containers | 32, 484 MB |
| Docker: volumes | 18, 3,9 GB (62 MB recuperáveis) |
| `overlay2` | 44 GB |

Espaço **não é risco no momento**. 59 GB livres, crescimento moderado.

### Volumes por tamanho

| Volume | Tamanho |
|---|---|
| `novacena_uploads` | 2,3 GB |
| `novacena-music_novacena_music_data` | 766 MB |
| `postgres_data` | 317 MB |
| `pgvector` | 81 MB |
| `n8n_redis` | 63 MB |
| `novacena_music_novacena_music_data` | 59 MB |
| `chatwoot_public` | 52 MB |
| `evolution_redis` | 39 MB |
| `chatwoot_redis` | 36 MB |
| `minio_data` | 13 MB |
| demais (8) | < 1 MB cada |

Total de dados vivos: **~3,7 GB**. Isso é a boa notícia da revisão: o conjunto
que precisa de backup é pequeno e cabe confortavelmente em qualquer destino.

---

## 2. O que o backup existente realmente cobre

Do próprio cabeçalho do script:

- `data/` — snapshot diário datado (tar.gz), retenção 30 dias
- `public/uploads/` — espelho incremental via `s3 sync`

Destino: bucket S3 do Remotion, prefixo `backups/novacena/`. Credenciais em
`/root/.novacena-backup.env` (modo 600) — **não foi aberto**.

**Cobre um serviço de treze.** Não cobre: PostgreSQL 14 compartilhado, pgvector,
banco do Encantaria, MinIO, volumes do Chatwoot, sessões da Evolution API,
Typebot, NocoDB, nem os manifestos de stack.

---

## 3. Poda de imagens

Existem **duas** configurações independentes, e nenhuma das duas sabe da outra:

| Origem | Horário | Comando |
|---|---|---|
| `crontab -l` (root) | 03:30 | `docker image prune -af` |
| `crontab -l` (root) | 03:45 | `docker container prune -f` |
| `crontab -l` (root) | 04:00 | `docker builder prune -af` |
| `/etc/cron.d/docker-image-prune` | 00:23 | `docker image prune -af --filter "until=24h"` |

O log `/var/log/novacena-docker-prune.log` mostra **`Total reclaimed space: 0B`**
em todas as execuções recentes. Ou seja: hoje a poda não está removendo nada,
porque todas as imagens estão em uso.

Isso reduz a urgência de R-005, mas não elimina o risco: no dia de um deploy, a
imagem anterior deixa de estar em uso e é removida na primeira janela seguinte.

Há ainda um cron horário que executa `docker exec ... npm run cleanup:transient`
no container do `novacena-motion`.

---

## 4. Sistema operacional

| Item | Valor |
|---|---|
| Distribuição | Debian 11 (bullseye) |
| Kernel em execução | 5.10.0-37-cloud-amd64 |
| Uptime | 193 dias |
| `unattended-upgrades` | ativo |
| Timers de APT | `apt-daily` e `apt-daily-upgrade` ativos |

---

## 5. Rede

`2377` (gestão do Swarm), `7946` (descoberta) e `4789/udp` (VXLAN) escutam em
todas as interfaces. `80`, `443` e `22` públicas; `8088` restrita ao loopback.

Swarm de **nó único** — nenhuma das três portas de cluster precisa ser
alcançável de fora.

---

## 6. Automação já existente no host

Descoberta relevante: a VPS **já se auto-implanta**.

`novacena-autodeploy.timer` roda **a cada 2 minutos**. O script faz `git pull`,
e havendo commit novo executa `git reset --hard`, `docker build` e
`docker service update` — com **rollback automático** em caso de falha.

Isso é mais maduro do que o Ciclo 1 supunha. E é também a origem do risco R-002.

---

## Riscos

### R-001 · CRÍTICO — O backup cobre 1 de 13 stacks

**Evidência.** O script protege apenas `data/` e `public/uploads/` do
NovaCena Motion. Os demais 12 stacks não aparecem em nenhuma rotina.

**Impacto.** Perda da VPS hoje significa perder: todos os workflows e credenciais
do n8n, o histórico do Chatwoot, as sessões de WhatsApp da Evolution API, os
chatbots do Typebot, as bases do NocoDB, os objetos do MinIO, o CMS do Encantaria
e os três bancos PostgreSQL. Isso é a operação inteira de todos os clientes.

**Probabilidade.** Baixa por período, mas cumulativa. Um nó único, sem
redundância, com 193 dias de uptime.

**Ação recomendada.** Estender a cobertura, priorizando `pg_dump` do PostgreSQL
compartilhado — é onde vivem os workflows e as credenciais do n8n. Ver
`docs/operations/vps-stabilization-plan.md`.

**Rollback.** Não se aplica: adicionar backup não altera serviço.
**Aprovação.** Nível 1 para desenvolver e testar; Nível 2 para agendar na VPS.

---

### R-002 · CRÍTICO — O backup provavelmente arquiva a cópia errada

Este é o achado mais importante da revisão.

**Evidência.**

| O que | Caminho | Tamanho | Última modificação |
|---|---|---|---|
| Origem do backup (`data`) | `/var/www/novacena-motion/data` | 352 KB | 2026-07-02 |
| Volume Docker | `novacena_data/_data` | 244 KB | 2026-07-01 |
| Origem do backup (uploads) | `/var/www/novacena-motion/public/uploads` | 791 MB | — |
| Volume Docker | `novacena_uploads/_data` | **2,3 GB** | 2026-06-23 |

O container `novacena-motion.1.*` reporta **2 volumes locais** em
`docker system df -v`, e existem exatamente dois volumes `novacena_*`.
Os dois conjuntos têm a mesma estrutura interna (`artists`, `overlays`,
`covers`…), mas tamanhos muito diferentes.

Além disso, `/var/www/novacena-motion` é a **cópia de trabalho do Git**, sobre a
qual o autodeploy executa `git reset --hard` a cada novo commit.

**Impacto.** O backup roda todo dia, reporta sucesso, e pode estar arquivando o
checkout do repositório em vez dos dados de runtime. Aproximadamente **1,5 GB de
mídia de clientes** está fora da cópia. O tarball diário tem 28 KB — pequeno
demais para ser a base de um SaaS com usuários e galeria.

Um backup que reporta sucesso e protege a coisa errada é pior que backup
nenhum: produz confiança sem produzir proteção.

**Probabilidade de estar errado.** Alta, dada a divergência de tamanho e o
comportamento do autodeploy.

**O que falta para ser conclusivo.** Confirmar as montagens reais do serviço.
Isso exige `docker service inspect`, bloqueado pelo guarda por expor variáveis
de ambiente. É a única verificação pendente, e precisa de aprovação de Nível 1.

**Ação recomendada.** Confirmar as montagens **antes** de qualquer outra ação de
backup. Se confirmado, corrigir a origem para os volumes.

**Rollback.** Trivial — a correção é de caminho no script.
**Aprovação.** Nível 1 para a verificação; Nível 2 para alterar o script.

---

### R-003 · ALTO — Portas de gestão do Swarm expostas

**Evidência.** `2377`, `7946` e `4789/udp` em todas as interfaces, em Swarm de
nó único. Não foi possível confirmar firewall na borda da Hostinger.

**Impacto.** A porta 2377 é o plano de controle do cluster.

**Ação.** Verificar o firewall externo no painel da Hostinger e restringir.
**Rollback.** Sim, regra reversível. **Aprovação.** Nível 2.

---

### R-004 · ALTO — Arquivo com nome de backup de ambiente em `/root`

**Evidência.** Nome indica cópia de variáveis de produção, datado de maio de
2026. **Não foi aberto.** Existe também `/root/.novacena-backup.env` (modo 600),
que é operacional e legítimo, mas igualmente em texto plano.

**Ação.** Rotacionar as credenciais e então remover o arquivo antigo. Rotacionar
primeiro, apagar depois. **Aprovação.** Nível 2.

---

### R-005 · MÉDIO — Poda elimina a possibilidade de rollback

**Evidência.** Ver seção 3. Duas configurações independentes, ambas com `-a`.

**Impacto.** No dia de um deploy, a imagem anterior deixa de estar em uso e é
removida na janela seguinte. O autodeploy tem `--rollback` do Swarm, que depende
da imagem anterior existir localmente.

**Atenuante.** Hoje a poda recupera 0 B; o problema só se materializa após
deploy. Mas o autodeploy roda a cada 2 minutos.

**Ação.** Ver `docs/operations/docker-retention-policy.md`. **Aprovação.** Nível 2.

---

### R-006 · MÉDIO — Duas configurações de poda que se ignoram

**Evidência.** `crontab` às 03:30 e `/etc/cron.d/docker-image-prune` às 00:23.
Só a segunda tem `--filter until=24h`.

**Impacto.** Mudar uma e achar que resolveu. Qualquer correção precisa tratar as
duas. **Ação.** Consolidar. **Aprovação.** Nível 2.

---

### R-007 · MÉDIO — `novacena-music` duplicado

Confirmado: stack Swarm (3 serviços) e projeto Compose em
`/opt/novacena-music/docker-compose.yml` (3 containers), com volumes de nomes
quase idênticos (766 MB e 59 MB) e duas redes.

A diferença de tamanho dos volumes sugere que **o Compose é o ativo** e o Swarm o
resíduo — mas isso é inferência. Ver `docs/discovery/service-ownership.md`.

**Aprovação.** Nível 2 — desligar o par errado tira o serviço do ar.

---

### R-008 · MÉDIO — Debian 11 no fim do ciclo de suporte

193 dias sem reboot, com `unattended-upgrades` ativo. Correções de kernel
aplicadas em disco não estão em memória.

**Ação.** Planejar reboot em janela e, depois, migração. **Aprovação.** Nível 2.

---

### R-009 · BAIXO — Container órfão e serviços sem repositório

`determined_neumann` (152 MB, `novacena-editais-tools:v2`, 2 semanas) fora de
qualquer stack. `novacena-editais` e `novacena-propostas` sem repositório
conhecido. Ver `inventory/orphan-services.yaml`.

---

### R-010 · BAIXO — `nginx.service` do host falhado

Falho desde 2026-06-20, desabilitado, sem impacto (Traefik atende 80/443).
Gera alarme falso em qualquer monitoramento que olhe `systemctl`.

---

## Riscos descartados nesta revisão

| Risco suposto | Situação real |
|---|---|
| Espaço em disco crítico | **Descartado.** 38% usado, 59 GB livres |
| Inodes esgotando | **Descartado.** 16% |
| Não existe backup nenhum | **Descartado.** Existe, externo e diário — mas ver R-001 e R-002 |
| Não existe rollback de deploy | **Descartado.** O autodeploy tem `--rollback` do Swarm |
| Não existe automação de deploy | **Descartado.** Autodeploy pull-based a cada 2 minutos |
| Containers em erro | **Descartado.** Zero |

---

## Resumo

| ID | Severidade | Risco | Aprovação |
|---|---|---|---|
| R-001 | crítico | Backup cobre 1 de 13 stacks | 1 / 2 |
| R-002 | crítico | Backup provavelmente arquiva a cópia errada | 1 / 2 |
| R-003 | alto | Portas do Swarm expostas | 2 |
| R-004 | alto | Arquivo de ambiente em `/root` | 2 |
| R-005 | médio | Poda elimina rollback | 2 |
| R-006 | médio | Duas podas que se ignoram | 2 |
| R-007 | médio | `novacena-music` duplicado | 2 |
| R-008 | médio | Debian 11 sem reboot há 193 dias | 2 |
| R-009 | baixo | Órfãos e serviços sem repositório | 1 |
| R-010 | baixo | `nginx.service` falhado | 1 |

**Nenhum foi corrigido.** Correção exige aprovação ou informação que só o dono tem.
