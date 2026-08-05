#!/usr/bin/env bash
# =============================================================================
# backup-postgres.sh — dump consistente dos PostgreSQL da VPS
# =============================================================================
# Roda NA VPS. Usa `pg_dump` DENTRO do container, que e a unica forma de obter
# um dump consistente. Copiar o diretorio de dados de um Postgres em execucao
# NAO e backup: e uma copia possivelmente corrompida no meio de uma transacao.
#
# Uso:
#   scripts/backup/backup-postgres.sh                 # dry-run (padrao)
#   scripts/backup/backup-postgres.sh --apply         # executa de verdade
#   scripts/backup/backup-postgres.sh --list          # so lista os alvos
#
# NAO interrompe servico: pg_dump abre uma transacao de leitura.
# NAO imprime credencial: usa o superusuario ja configurado dentro do container.
# =============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

# Alvos: nome logico | container (filtro de nome) | usuario padrao da imagem
TARGETS=(
  "postgres-shared|postgres_postgres|postgres"
  "pgvector|pgvector_pgvector|postgres"
  "encantaria|encantaria_database|postgres"
)

LIST_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) BACKUP_DRY_RUN=0 ;;
    --dry-run) BACKUP_DRY_RUN=1 ;;
    --list) LIST_ONLY=1 ;;
    *) die "argumento desconhecido: $arg" ;;
  esac
done

if [ "$LIST_ONLY" = "1" ]; then
  echo "Alvos PostgreSQL configurados:"
  for t in "${TARGETS[@]}"; do
    echo "  - ${t%%|*}  (container: $(echo "$t" | cut -d'|' -f2))"
  done
  exit 0
fi

command -v docker >/dev/null 2>&1 || die "docker nao encontrado. Este script roda NA VPS."

backup_begin
OUT_DIR="$BACKUP_WORK_DIR/postgres"
mkdir -p "$OUT_DIR" 2>/dev/null || true

# Estimativa grosseira: 1 GB por instancia cobre folgadamente os volumes
# observados (317MB + 81MB + pequeno). Falha antes de escrever se nao couber.
require_space $((1024 * ${#TARGETS[@]})) "$BACKUP_WORK_DIR"

for target in "${TARGETS[@]}"; do
  name="${target%%|*}"
  filter="$(echo "$target" | cut -d'|' -f2)"
  pguser="$(echo "$target" | cut -d'|' -f3)"

  cid="$(docker ps --filter "name=$filter" --format '{{.ID}}' 2>/dev/null | head -1)"
  if [ -z "$cid" ]; then
    log "AVISO: container de '$name' (filtro $filter) nao encontrado — pulando"
    manifest_add "$name" postgres "$filter" "" 0 "" "skipped_container_not_found"
    continue
  fi

  # Lista as bases reais, ignorando os templates do proprio Postgres.
  dbs="$(docker exec "$cid" psql -U "$pguser" -tAc \
    "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> 'postgres';" 2>/dev/null)"

  if [ -z "$dbs" ]; then
    log "AVISO: nenhuma base listada em '$name' — pulando"
    manifest_add "$name" postgres "$filter" "" 0 "" "skipped_no_databases"
    continue
  fi

  log "$name: bases encontradas -> $(printf '%s' "$dbs" | tr '\n' ' ')"

  while IFS= read -r db; do
    [ -z "$db" ] && continue
    artifact="$OUT_DIR/${name}-${db}-${BACKUP_STAMP}.dump"

    # --format=custom permite restauracao seletiva por tabela e ja vem comprimido.
    if is_dry_run; then
      log "DRY-RUN  pg_dump -U $pguser -Fc '$db' (container $name) -> $(basename "$artifact")"
      manifest_add "$name/$db" postgres "$filter" "$(basename "$artifact")" 0 "" "dry_run"
    else
      if docker exec "$cid" pg_dump -U "$pguser" --format=custom --no-owner "$db" > "$artifact" 2>/dev/null; then
        bytes="$(wc -c < "$artifact" | tr -d ' ')"
        sha="$(checksum "$artifact")"
        log "$name/$db: ${bytes} bytes, sha256 ${sha:0:16}..."
        manifest_add "$name/$db" postgres "$filter" "$(basename "$artifact")" "$bytes" "$sha" "ok"
      else
        rm -f "$artifact"
        log "FALHA ao dumpar $name/$db"
        manifest_add "$name/$db" postgres "$filter" "" 0 "" "failed"
      fi
    fi
  done <<< "$dbs"
done

prune_old "$OUT_DIR" "*.dump" "$BACKUP_RETENTION_DAYS"
backup_end
