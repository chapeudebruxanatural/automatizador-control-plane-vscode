#!/usr/bin/env bash
# =============================================================================
# backup-volumes.sh — copia dos volumes Docker que nao sao banco de dados
# =============================================================================
# Roda NA VPS.
#
# IMPORTANTE — o que este script NAO faz:
#   Ele NAO copia volumes de PostgreSQL. Um tar do diretorio de dados de um
#   Postgres em execucao nao e backup consistente. Use backup-postgres.sh.
#   Os volumes de banco estao na lista EXCLUDED e sao recusados explicitamente.
#
# Uso:
#   scripts/backup/backup-volumes.sh              # dry-run (padrao)
#   scripts/backup/backup-volumes.sh --apply
#   scripts/backup/backup-volumes.sh --list
# =============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

# Volumes com dados de aplicacao, seguros para copia a frio.
INCLUDED=(
  novacena_uploads
  novacena_data
  chatwoot_public
  chatwoot_storage
  chatwoot_mailers
  evolution_instances
  minio_data
  nocodb_data
  novacena_music_novacena_music_data
  novacena-music_novacena_music_data
)

# Recusados de proposito, com o motivo. Documentar a recusa vale mais que
# omitir o volume: quem ler a lista entende por que ele nao esta no backup.
EXCLUDED=(
  "postgres_data|banco: use backup-postgres.sh (tar de Postgres ativo e inconsistente)"
  "pgvector|banco: use backup-postgres.sh"
  "n8n_redis|fila volatil: perda causa reexecucao, nao perda de definicao"
  "chatwoot_redis|fila volatil"
  "evolution_redis|fila volatil"
  "volume_swarm_certificates|contem chaves privadas TLS; o Traefik reemite sozinho"
  "portainer_data|reconstrutivel a partir da configuracao"
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
  echo "Volumes INCLUIDOS:"; printf '  - %s\n' "${INCLUDED[@]}"
  echo; echo "Volumes EXCLUIDOS (com motivo):"
  for e in "${EXCLUDED[@]}"; do printf '  - %-40s %s\n' "${e%%|*}" "${e#*|}"; done
  exit 0
fi

# Raiz dos volumes. Parametrizavel para que o par backup -> verificacao possa
# ser exercitado em teste com dados sinteticos, sem docker e sem tocar em dado
# real. Em producao permanece o padrao.
BACKUP_VOLUME_ROOT="${BACKUP_VOLUME_ROOT:-/var/lib/docker/volumes}"

if [ "$BACKUP_VOLUME_ROOT" = "/var/lib/docker/volumes" ]; then
  command -v docker >/dev/null 2>&1 || die "docker nao encontrado. Este script roda NA VPS."
fi

backup_begin
OUT_DIR="$BACKUP_WORK_DIR/volumes"
mkdir -p "$OUT_DIR" 2>/dev/null || true

# Soma o tamanho dos volumes incluidos e exige espaco para eles mais a margem.
total_kb=0
for v in "${INCLUDED[@]}"; do
  d="$BACKUP_VOLUME_ROOT/$v/_data"
  [ -d "$d" ] || continue
  kb="$(du -sk "$d" 2>/dev/null | awk '{print $1}')"
  total_kb=$((total_kb + ${kb:-0}))
done
log "tamanho somado dos volumes incluidos: $((total_kb / 1024))MB"
require_space $((total_kb / 1024)) "$BACKUP_WORK_DIR"

for vol in "${INCLUDED[@]}"; do
  src="$BACKUP_VOLUME_ROOT/$vol/_data"
  if [ ! -d "$src" ]; then
    log "AVISO: volume '$vol' nao existe — pulando"
    manifest_add "$vol" volume "$src" "" 0 "" "skipped_not_found"
    continue
  fi

  artifact="$OUT_DIR/${vol}-${BACKUP_STAMP}.tar.gz"

  if is_dry_run; then
    kb="$(du -sk "$src" 2>/dev/null | awk '{print $1}')"
    log "DRY-RUN  tar -czf $(basename "$artifact") <- $src (${kb:-0}KB)"
    manifest_add "$vol" volume "$src" "$(basename "$artifact")" $(( ${kb:-0} * 1024 )) "" "dry_run"
  else
    if tar -czf "$artifact" -C "$(dirname "$src")" "$(basename "$src")" 2>/dev/null; then
      bytes="$(wc -c < "$artifact" | tr -d ' ')"
      sha="$(checksum "$artifact")"
      log "$vol: ${bytes} bytes, sha256 ${sha:0:16}..."
      manifest_add "$vol" volume "$src" "$(basename "$artifact")" "$bytes" "$sha" "ok"
    else
      rm -f "$artifact"
      log "FALHA ao arquivar $vol"
      manifest_add "$vol" volume "$src" "" 0 "" "failed"
    fi
  fi
done

for e in "${EXCLUDED[@]}"; do
  manifest_add "${e%%|*}" volume "" "" 0 "" "excluded"
  log "excluido: ${e%%|*} — ${e#*|}"
done

prune_old "$OUT_DIR" "*.tar.gz" "$BACKUP_RETENTION_DAYS"
backup_end
