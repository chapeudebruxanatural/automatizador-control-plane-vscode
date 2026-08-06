# Levantamento da VPS `nvvps` — 2026-08-06

**Método:** `scripts/collect-vps-inventory.sh` (410 linhas) + diagnóstico dirigido
(161 linhas). Ambos somente leitura, com recusa de verbo mutante em tempo de
execução. Bruto sanitizado; nenhum valor de segredo foi lido ou transcrito.

**Host:** `automatizadoria` · Debian 11 (bullseye), kernel 5.10 · 2 vCPU AMD EPYC
7543P · 7,8 GB RAM · 99 GB disco (38% usado) · **194 dias de uptime**

`verificationStatus: verified` salvo onde indicado.

---

## 1. O que mudou nesta sessão

Três correções aplicadas em 06/08, com o dono executando cada comando:

| # | Correção | Estado | Rollback |
|---|---|---|---|
| 1 | `docker image/builder prune -af` → `-f --filter until=720h` | ✅ aplicado | `/root/crontab.backup.20260806023843.txt` |
| 2 | Bloquear 2377/7946/4789 via `ufw` | ❌ **não aplicado** — `ufw` não instalado | — |
| 3 | Swap de 2 GB (`/swapfile`, em `/etc/fstab`) | ✅ aplicado | `swapoff /swapfile && rm /swapfile && sed -i '/swapfile/d' /etc/fstab` |

A correção 2 falhou **antes** de qualquer `deny`. Nenhuma regra ficou meio-aplicada,
que era o cenário capaz de trancar o acesso SSH.

---

## 2. Backup — R-001 e R-002 reavaliados

### O que estava registrado

§10.1 do HANDOFF dizia: backup diário em S3, só do NovaCena Motion (R-001,
crítico), e "provavelmente arquiva a cópia errada — checkout do Git em vez dos
volumes Docker, 791 MB vs 2,3 GB" (R-002, crítico).

### O que foi verificado

**O backup é real, externo e funciona.** `verified`

- `novacena-backup.timer` **ativo**, dispara `novacena-backup.service` às 04:15
- **6 execuções consecutivas com sucesso**, de 31/07 a 05/08 (status 0/SUCCESS)
- Destino: **bucket S3 de verdade**, não o MinIO local. A hipótese de "backup no
  mesmo disco que deveria proteger" está **descartada**
- Credenciais **fora do script**: `docker run --env-file "$ENV_FILE"`, não inline
- Mecânica: `aws s3 cp` de tarball de `data/` + `aws s3 sync` de `uploads/`, com
  rotina de expurgo de objetos antigos

### O risco que permanece, agora quantificado

**R-001 confirmado e pior do que "insuficiente": o backup cobre 1 stack de 13.**

O script arquiva **caminhos de arquivo**, não **volumes Docker**. Os doze stacks
restantes guardam estado em volumes que nenhuma rotina toca:

```
postgres_data      chatwoot_storage    chatwoot_public    chatwoot_redis
pgvector           n8n_redis           evolution_instances evolution_redis
nocodb_data        minio_data          portainer_data     novacena_uploads
```

Inclui **dois Postgres** (`postgres:14` e `pgvector/pgvector:pg16`). Perda de
disco hoje significa perda total de Chatwoot, n8n, Typebot, NocoDB, Evolution,
Encantaria e pgvector.

**R-002 reformulado.** A suspeita de "arquiva o checkout do Git" não se
confirmou — o script aponta para `data/` e `uploads/`, que são dados de
aplicação. A discrepância 791 MB × 2,3 GB **segue sem explicação** e precisa de
uma comparação direta entre o tamanho do tarball e o do volume correspondente.
`verificationStatus: requires_verification`

`/root/backups` tem 750 MB, mas são snapshots avulsos de **13/07** e **12/05** —
não é o backup diário, e não é rotativo.

---

## 3. Firewall — R-003 é mais grave do que estava escrito

O registro anterior dizia "portas 2377/7946 do Swarm expostas em todas as
interfaces". A verificação mostra que o problema não é regra frouxa:

```
-P INPUT ACCEPT
```

**Não existe nenhuma regra em INPUT.** As únicas cadeias populadas são as do
Docker, e são de `FORWARD`/`DOCKER`. O host não filtra entrada.

Expostas hoje, sem filtro: **2377** (gerência do Swarm), **7946** (descoberta),
**4789/udp** (VXLAN), **3000** (dockerd), além de 22, 80 e 443.

**`ufw` não está instalado, e não deve ser.** Em host com Docker, `ufw` não se
aplica a portas publicadas por container e cria falsa sensação de proteção.
Mexer em `iptables` direto num nó Swarm é pior: o Docker reescreve as próprias
cadeias.

**Correção indicada:** firewall do painel da Hostinger, que fica **fora** do host —
libera 22, 80, 443 e bloqueia o resto. Não quebra rede de container e não tranca
o acesso SSH.

---

## 4. O `prune` nunca apagou nada — e por que a correção valeu assim mesmo

Log em `/var/log/novacena-docker-prune.log`: **233 KB, e todas as linhas são
`Total reclaimed space: 0B`.** O cron rodava `prune -af` diariamente há meses e
nunca recuperou um byte, porque todas as imagens estão em uso por serviços do
Swarm.

Ou seja: **nenhuma imagem foi perdida.** O risco era real mas nunca se
materializou — e estava a um `docker service scale 0` de se materializar, porque
`-a` apaga imagem sem container em uso **inclusive com tag**, e estas não têm
registry de onde voltar:

```
novacena-music-backend:local   novacena-music-frontend:local
novacena-editais:v3            novacena-editais-tools:v2
novacena-motion:auto-8bf8c5c
```

A troca por `--filter until=720h` não custa nada em disco (o ganho sempre foi
zero) e fecha a janela.

---

## 5. Outros achados

**`nginx.service` está `failed` desde 20/06/2026, e é órfão.** Está `disabled` no
boot e gastou 87 ms de CPU. O proxy real é o `traefik_traefik` (v3.4.0) em Swarm.
Unidade falha há um mês e meio é ruído que esconde falha de verdade — vale
`systemctl reset-failed nginx` ou mascarar.

**Memória.** 5,4 de 7,8 GB usados, 1,9 GB disponível, com 28 serviços num nó só.
Antes desta sessão o swap era **zero** — sem swap o kernel mata processo em vez
de degradar. Não há registro de OOM no buffer atual. Com 2 GB de swap ativo o
comportamento passa a ser recuperável.

**Debian 11 (bullseye) com 194 dias sem reboot.** O LTS do 11 se encerra em
agosto de 2026 — ou seja, agora. V-001 segue aberto e é o item de maior prazo.

**Topologia.** Swarm de **um nó só**, `Leader`, engine 28.5.1. 13 stacks, 28
serviços, todos `replicated 1/1` ou `global 1/1`. Não há redundância: o nó é o
ponto único de falha para quatro clientes.

**`/root` tem arquivos soltos de operação anterior** — R-004 confirmado:
`novacena-env-production.backup.20260521152109`, `novacena-vps-before-fix...patch`,
`novacena-diag-...txt`. **Não foram abertos.** O nome do primeiro sugere variáveis
de produção em texto claro fora de qualquer cofre.

---

## 6. Prioridades sugeridas

| Ordem | Item | Por quê |
|---|---|---|
| 1 | Backup dos volumes Docker dos outros 12 stacks | Perda de disco hoje = perda total de dado de 4 clientes |
| 2 | Firewall no painel da Hostinger | Porta de gerência do cluster aberta para a internet, sem filtro |
| 3 | Explicar 791 MB × 2,3 GB (R-002) | Backup que roda com sucesso mas guarda a coisa errada é pior que backup ausente, porque dá confiança |
| 4 | Plano de saída do Debian 11 | Prazo, não urgência |
| 5 | `reset-failed` no nginx órfão | Higiene de sinal |

Nada acima foi executado. Itens 1 a 4 são escrita na VPS e exigem aprovação
específica, conforme §3 do HANDOFF.

---

## 7. O item 1 é menor do que parece — os scripts já existem

Verificado em 06/08, depois de quase reescrever do zero o que já estava pronto.

`scripts/backup/` contém `backup-volumes.sh`, `backup-postgres.sh`,
`backup-configs.sh` e um `lib.sh` compartilhado. `scripts/restore/` contém
`restore-postgres.sh` e `verify-manifest.sh`. São bem construídos:

- `backup-volumes.sh` **recusa** volumes de banco, com o motivo declarado em cada
  entrada da lista de exclusão — um `tar` de PGDATA vivo não é backup
- `backup-postgres.sh` usa `pg_dump` **dentro do container**, que é a única forma
  de obter dump consistente
- `backup-configs.sh` **sanitiza** `environment:` antes de arquivar: guarda a
  topologia, nunca os valores
- `lib.sh` traz manifesto com checksum, verificação de espaço livre e dry-run
  por padrão

**Faltam exatamente duas coisas, e nenhuma é construir backup:**

**(a) Não estão instalados na VPS.** Vivem só no repositório.

**(b) Não sobem para lugar nenhum.** Escrevem em `/tmp/control-plane-backup` e
param ali — backup no mesmo disco que deveria proteger, que é o modo de falha
que descartamos para o MinIO e que aqui é real. O mecanismo de upload já existe
funcionando ao lado: `aws cli` em container com `--env-file`, rodando há meses
no `novacena-backup.sh`. É reaproveitar, não inventar.

**Ordem sugerida para fechar o R-001:**

1. Rodar os três em dry-run **na VPS**, conferindo espaço livre (59 GB) contra o
   tamanho somado que o próprio script reporta
2. Rodar com `--apply`, gerando local, e validar com `verify-manifest.sh`
3. Só então acrescentar o upload, reusando `ENV_FILE` e o bucket do
   `novacena-backup.sh`
4. Por último, um `systemd` timer no mesmo molde do `novacena-backup.timer`

Testar o **restore** antes de considerar resolvido. Backup que nunca foi
restaurado é hipótese, não garantia.
