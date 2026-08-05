#!/usr/bin/env bash
# =============================================================================
# scripts/backup/lib.sh — funcoes comuns dos scripts de backup
# =============================================================================
# Nao executa nada sozinho. Fornece: timestamp, checksum, manifest, validacao
# de espaco, retencao, log sanitizado e dry-run.
#
# Principios:
#   - dry-run e o PADRAO. Escrever exige --apply explicito.
#   - falha ANTES de encher o disco, nao depois.
#   - nunca imprime segredo, nem em log, nem em erro.
#   - nao interrompe servico: usa dump/copia, nunca stop.
# =============================================================================
set -uo pipefail

# --- Estado global -----------------------------------------------------------
BACKUP_DRY_RUN="${BACKUP_DRY_RUN:-1}"      # 1 = simula (padrao), 0 = aplica
BACKUP_STAMP="${BACKUP_STAMP:-$(date -u '+%Y%m%d-%H%M%S')}"
BACKUP_WORK_DIR="${BACKUP_WORK_DIR:-/tmp/control-plane-backup}"
BACKUP_MIN_FREE_MB="${BACKUP_MIN_FREE_MB:-2048}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_LOG="${BACKUP_LOG:-$BACKUP_WORK_DIR/backup-$BACKUP_STAMP.log}"
BACKUP_MANIFEST="${BACKUP_MANIFEST:-$BACKUP_WORK_DIR/manifest-$BACKUP_STAMP.json}"

# Padroes redigidos em qualquer saida. Mesma lista do logger da aplicacao.
_SECRET_PATTERNS='gh[pousr]_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}|(postgres|postgresql|mysql|redis|amqp)://[^:@/[:space:]]+:[^@/[:space:]]+@'

##
# Redige qualquer coisa com formato de segredo antes de imprimir.
# Toda saida do script passa por aqui. Se um dump de erro trouxer uma URL de
# conexao com senha, ela nao chega ao log.
##
sanitize() {
  sed -E "s#($_SECRET_PATTERNS)#[REDACTED]#g"
}

log() {
  local msg="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
  printf '%s\n' "$msg" | sanitize | tee -a "$BACKUP_LOG" >/dev/null
  printf '%s\n' "$msg" | sanitize
}

die() { log "ERRO: $*"; exit 1; }

is_dry_run() { [ "$BACKUP_DRY_RUN" != "0" ]; }

##
# Executa (ou simula) um comando. Em dry-run apenas registra a intencao.
##
run() {
  if is_dry_run; then
    log "DRY-RUN  $*"
    return 0
  fi
  log "EXEC     $*"
  "$@"
}

##
# Checksum portatil: sha256sum no Linux, shasum -a 256 no macOS.
##
checksum() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    echo "no-checksum-tool"
  fi
}

##
# Espaco livre em MB no filesystem que contem o caminho.
##
free_mb() {
  local path="$1"
  while [ ! -d "$path" ] && [ "$path" != "/" ]; do path="$(dirname "$path")"; done
  df -Pm "$path" 2>/dev/null | awk 'NR==2 {print $4}'
}

##
# Recusa comecar se o espaco livre nao cobrir o necessario mais a margem.
# Encher o disco de um host de producao e pior que nao ter backup naquele dia.
##
require_space() {
  local needed_mb="$1" path="${2:-$BACKUP_WORK_DIR}"
  local free; free="$(free_mb "$path")"
  [ -z "$free" ] && { log "AVISO: nao foi possivel medir espaco livre em $path"; return 0; }

  local required=$((needed_mb + BACKUP_MIN_FREE_MB))
  log "espaco: livre=${free}MB necessario=${needed_mb}MB margem=${BACKUP_MIN_FREE_MB}MB"
  [ "$free" -lt "$required" ] && \
    die "espaco insuficiente em $path (livre ${free}MB, exigido ${required}MB). Backup abortado ANTES de escrever."
  return 0
}

# --- Manifest ----------------------------------------------------------------
_MANIFEST_ITEMS=()

manifest_init() {
  mkdir -p "$(dirname "$BACKUP_MANIFEST")" 2>/dev/null || true
  _MANIFEST_ITEMS=()
}

manifest_add() {
  local name="$1" kind="$2" source="$3" artifact="$4" bytes="$5" sha="$6" status="$7"
  _MANIFEST_ITEMS+=("$(printf '{"name":"%s","kind":"%s","source":"%s","artifact":"%s","bytes":%s,"sha256":"%s","status":"%s"}' \
    "$name" "$kind" "$source" "$artifact" "${bytes:-0}" "$sha" "$status")")
}

manifest_write() {
  local items=""
  local i
  for i in "${_MANIFEST_ITEMS[@]:-}"; do
    [ -z "$i" ] && continue
    [ -n "$items" ] && items="$items,"
    items="$items$i"
  done

  local json
  json="$(printf '{"stamp":"%s","createdAt":"%s","host":"%s","dryRun":%s,"retentionDays":%s,"items":[%s]}' \
    "$BACKUP_STAMP" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$(hostname)" \
    "$(is_dry_run && echo true || echo false)" "$BACKUP_RETENTION_DAYS" "$items")"

  if is_dry_run; then
    log "DRY-RUN  manifest seria escrito em $BACKUP_MANIFEST"
    printf '%s\n' "$json"
  else
    printf '%s\n' "$json" > "$BACKUP_MANIFEST"
    log "manifest: $BACKUP_MANIFEST ($(printf '%s' "$json" | wc -c | tr -d ' ') bytes)"
  fi
}

# --- Bootstrap ---------------------------------------------------------------
backup_begin() {
  mkdir -p "$BACKUP_WORK_DIR" 2>/dev/null || true
  manifest_init
  log "=== backup iniciado ==="
  log "stamp=$BACKUP_STAMP dry_run=$(is_dry_run && echo sim || echo NAO) work_dir=$BACKUP_WORK_DIR"
  is_dry_run && log "MODO SIMULACAO: nenhum arquivo sera escrito nem enviado."
}

backup_end() {
  manifest_write
  log "=== backup concluido ==="
}

##
# Retencao por idade, sempre em dry-run por padrao.
# Nunca apaga o artefato mais recente, mesmo que ele exceda a idade — um
# backup velho ainda e melhor que nenhum backup.
##
prune_old() {
  local dir="$1" pattern="$2" days="${3:-$BACKUP_RETENTION_DAYS}"
  [ -d "$dir" ] || { log "retencao: $dir nao existe, nada a fazer"; return 0; }

  local newest; newest="$(ls -t "$dir"/$pattern 2>/dev/null | head -1)"
  local f
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ "$f" = "$newest" ] && { log "retencao: preservando o mais recente ($(basename "$f"))"; continue; }
    run rm -f "$f"
  done < <(find "$dir" -maxdepth 1 -name "$pattern" -type f -mtime "+$days" 2>/dev/null)
}
