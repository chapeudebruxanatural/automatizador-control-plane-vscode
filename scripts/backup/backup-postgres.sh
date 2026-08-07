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
#
# O usuario NAO e sempre `postgres`. Em 06/08 o alvo do encantaria estava
# declarado com `postgres` e o container usa `directus` — o `psql -U postgres`
# voltava vazio SEM FALHAR, e o backup passou a reportar sucesso com zero bases.
# Ao adicionar um alvo, confirme o usuario real antes:
#   docker exec <cid> printenv POSTGRES_USER POSTGRES_DB
TARGETS=(
  "postgres-shared|postgres_postgres|postgres"
  "pgvector|pgvector_pgvector|postgres"
  "encantaria|encantaria_database|directus"
)

# Alvo declarado que nao rende nenhuma base e ERRO, nao aviso.
#
# Existe porque o modo de falha real nao foi "o script quebrou", foi "o script
# ficou verde e o backup saiu vazio". Relatorio verde com backup vazio e pior
# que falha ruidosa: da confianca onde nao ha cobertura. Se um alvo foi
# declarado, alguem afirmou que ha dado ali — nao render nada significa
# configuracao errada, nao ausencia legitima.
#
# Para remover um alvo de proposito, tire-o de TARGETS. Nao o deixe falhando
# em silencio.
STRICT_TARGETS="${STRICT_TARGETS:-1}"
MISSING_TARGETS=0

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
    # Quase sempre significa usuario errado no TARGETS: `psql -U <inexistente>`
    # volta vazio em vez de falhar. Ver o comentario em TARGETS.
    log "ERRO: alvo '$name' declarado, mas NENHUMA base foi listada."
    log "      Causa provavel: usuario '$pguser' nao existe nesse container."
    log "      Confira com: docker exec $cid printenv POSTGRES_USER POSTGRES_DB"
    manifest_add "$name" postgres "$filter" "" 0 "" "error_no_databases"
    MISSING_TARGETS=$((MISSING_TARGETS + 1))
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

# Sai diferente de zero quando um alvo declarado nao rendeu base nenhuma.
# E o que faz um systemd timer marcar a execucao como falha em vez de
# `Succeeded` — sem isso, backup vazio vira linha verde no journal.
if [ "$MISSING_TARGETS" -gt 0 ] && [ "$STRICT_TARGETS" = "1" ]; then
  log ""
  log "*** $MISSING_TARGETS alvo(s) declarado(s) sem nenhuma base. Backup INCOMPLETO."
  log "*** Corrija o TARGETS ou remova o alvo. Para ignorar: STRICT_TARGETS=0"
  exit 2
fi
