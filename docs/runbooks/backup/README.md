# Runbook — backup

Como executar os backups do Control Plane. Complementa o backup já existente do
NovaCena Motion, que continua rodando por conta própria.

> **Estado:** os scripts existem, foram testados em dry-run e em execução real
> com dados sintéticos. **Ainda não estão instalados na VPS** — instalar exige
> aprovação de Nível 2.
>
> **Nota de 2026-08-05:** por um período, estes arquivos existiam apenas
> localmente. A regra `backup/` no `.gitignore` (destinada a bloquear
> *diretórios de dados* de backup) também casava com `scripts/backup/` por
> coincidência de nome — `git add -A` os ignorava em silêncio, sem erro. O PR
> chegou a descrever os scripts como prontos antes de confirmar que estavam de
> fato versionados. Corrigido com uma negação explícita
> (`!scripts/backup/**`) no `.gitignore`. Lição: `git status`/`git ls-files`
> antes de declarar algo "commitado", não apenas "escrito em disco".

## Antes de qualquer coisa

`dry-run é o padrão`. Todos os scripts simulam por default; escrever exige
`--apply`. Se você digitou errado, o pior que acontece é um log.

## Os três scripts

| Script | Cobre | Método |
|---|---|---|
| `backup-postgres.sh` | 3 instâncias PostgreSQL | `pg_dump --format=custom` dentro do container |
| `backup-volumes.sh` | 10 volumes de aplicação | `tar -czf` do diretório do volume |
| `backup-configs.sh` | manifestos, scripts, sites estáticos | sanitiza e empacota |

**Por que PostgreSQL tem script próprio.** Um `tar` do diretório de dados de um
Postgres em execução não é backup: é uma cópia tirada no meio de transações,
que pode não abrir. `backup-volumes.sh` **recusa** os volumes de banco
explicitamente, com o motivo escrito na lista de exclusão.

## Uso

```bash
scripts/backup/backup-postgres.sh --list
```

```bash
scripts/backup/backup-postgres.sh
```

```bash
scripts/backup/backup-postgres.sh --apply
```

Os três aceitam `--apply`, `--dry-run` (padrão) e os dois primeiros aceitam
`--list`.

## Variáveis

| Variável | Padrão | Para quê |
|---|---|---|
| `BACKUP_DRY_RUN` | `1` | `0` aplica |
| `BACKUP_WORK_DIR` | `/tmp/control-plane-backup` | Onde os artefatos são escritos |
| `BACKUP_MIN_FREE_MB` | `2048` | Margem de disco exigida |
| `BACKUP_RETENTION_DAYS` | `30` | Idade máxima antes da poda |
| `BACKUP_VOLUME_ROOT` | `/var/lib/docker/volumes` | Só mude em teste |

## Garantias

**Falha antes de encher o disco.** `require_space` mede o espaço livre, soma o
tamanho estimado mais a margem, e aborta antes de escrever o primeiro byte.
Encher o disco de um host de produção é pior que perder um dia de backup.

**Nunca imprime segredo.** Toda saída passa por `sanitize()`, com os mesmos
padrões do logger da aplicação. `backup-configs.sh` vai além: sanitiza o
**conteúdo** dos manifestos antes de arquivar, preservando a chave e apagando o
valor — saber que existe uma variável `N8N_ENCRYPTION_KEY` é topologia útil;
saber o valor dela não.

**Não interrompe serviço.** `pg_dump` abre uma transação de leitura; `tar` lê o
diretório. Nenhum script para, reinicia ou reconfigura qualquer coisa.

**Retenção preserva o mais recente.** `prune_old` nunca apaga o artefato mais
novo, mesmo que ele exceda a idade. Um backup velho ainda é melhor que nenhum.

**Manifest com checksum.** Cada execução grava um JSON com nome, origem,
artefato, bytes, `sha256` e status por item.

## Depois de rodar

```bash
scripts/restore/verify-manifest.sh --manifest <manifest.json> --dir <artefatos>
```

Integridade não é restaurabilidade. Para provar que o dump abre, use
`scripts/restore/restore-postgres.sh`. Ver `docs/runbooks/restore/README.md`.

## O que falta para virar rotina

1. Aprovação de Nível 2 para instalar na VPS
2. Definir destino externo (ver `inventory/backups.yaml`)
3. Etapa de envio ao destino — hoje os scripts gravam localmente
4. Timer systemd, no mesmo padrão de `novacena-backup.timer`
5. Primeira restauração verificada

**Enquanto o passo 5 não acontecer, isto não é backup — é intenção de backup.**
