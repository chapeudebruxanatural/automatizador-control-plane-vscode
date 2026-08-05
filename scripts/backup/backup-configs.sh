#!/usr/bin/env bash
# =============================================================================
# backup-configs.sh — manifestos de stack, scripts e sites estaticos
# =============================================================================
# Roda NA VPS. Cobre o que hoje existe SOMENTE na VPS e em nenhum repositorio:
# os 13 manifestos de stack em /root, os scripts de automacao em
# /usr/local/bin, e o conteudo dos sites estaticos em /opt.
#
# SANITIZACAO OBRIGATORIA: manifestos de stack costumam conter `environment:`
# com credenciais. Este script SANITIZA antes de arquivar — o artefato guarda a
# topologia (imagens, redes, volumes, rotas), nunca os valores.
#
# Uso:
#   scripts/backup/backup-configs.sh              # dry-run (padrao)
#   scripts/backup/backup-configs.sh --apply
# =============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

for arg in "$@"; do
  case "$arg" in
    --apply) BACKUP_DRY_RUN=0 ;;
    --dry-run) BACKUP_DRY_RUN=1 ;;
    *) die "argumento desconhecido: $arg" ;;
  esac
done

##
# Remove valores sensiveis de um YAML de stack, preservando a estrutura.
#
# Substitui o VALOR de qualquer chave que pareca segredo, e de qualquer entrada
# de lista `- CHAVE=valor` dentro de `environment:`. A chave permanece — saber
# QUE existe uma variavel chamada N8N_ENCRYPTION_KEY e informacao util de
# topologia; saber o valor dela nao.
##
sanitize_yaml() {
  sed -E \
    -e 's/^([[:space:]]*-?[[:space:]]*[A-Za-z0-9_]*(PASSWORD|PASSWD|SECRET|TOKEN|KEY|CREDENTIAL|PASS|DSN|URI|URL)[A-Za-z0-9_]*[[:space:]]*[:=])[[:space:]]*.+$/\1 [REDACTED]/I' \
    -e 's#(postgres|postgresql|mysql|mongodb|redis|amqp)://[^:@/[:space:]]+:[^@/[:space:]]+@#\1://[REDACTED]@#g' \
    -e 's/(gh[pousr]_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{35})/[REDACTED]/g'
}

backup_begin
OUT_DIR="$BACKUP_WORK_DIR/configs"
STAGE="$BACKUP_WORK_DIR/configs-stage-$BACKUP_STAMP"
mkdir -p "$OUT_DIR" 2>/dev/null || true

require_space 512 "$BACKUP_WORK_DIR"

# --- 1) Manifestos de stack (sanitizados) ------------------------------------
if is_dry_run; then
  n="$(ls -1 /root/*.yaml 2>/dev/null | wc -l | tr -d ' ')"
  log "DRY-RUN  sanitizaria e arquivaria $n manifesto(s) de /root/*.yaml"
  manifest_add "stack-manifests" config "/root/*.yaml" "" 0 "" "dry_run"
else
  mkdir -p "$STAGE/stacks"
  count=0
  for f in /root/*.yaml; do
    [ -f "$f" ] || continue
    sanitize_yaml < "$f" > "$STAGE/stacks/$(basename "$f")"
    count=$((count + 1))
  done
  log "sanitizados $count manifesto(s) de stack"
  manifest_add "stack-manifests" config "/root/*.yaml" "stacks/" "$count" "" "ok"
fi

# --- 2) Scripts de automacao (sanitizados) -----------------------------------
if is_dry_run; then
  log "DRY-RUN  sanitizaria /usr/local/bin/novacena-*.sh e /root/scripts/*.sh"
  manifest_add "automation-scripts" config "/usr/local/bin" "" 0 "" "dry_run"
else
  mkdir -p "$STAGE/scripts"
  for f in /usr/local/bin/novacena-*.sh /root/scripts/*.sh; do
    [ -f "$f" ] || continue
    sanitize_yaml < "$f" > "$STAGE/scripts/$(basename "$f")"
  done
  manifest_add "automation-scripts" config "/usr/local/bin" "scripts/" 0 "" "ok"
fi

# --- 3) Sites estaticos sem repositorio conhecido ----------------------------
# Ver inventory/orphan-services.yaml: hoje so existem aqui.
for app in novacena-propostas automatizadoria-compliance-site; do
  src="/opt/$app"
  if [ ! -d "$src" ]; then
    log "AVISO: $src nao existe — pulando"
    manifest_add "$app" static "$src" "" 0 "" "skipped_not_found"
    continue
  fi
  if is_dry_run; then
    kb="$(du -sk "$src" 2>/dev/null | awk '{print $1}')"
    log "DRY-RUN  arquivaria $src (${kb:-0}KB)"
    manifest_add "$app" static "$src" "" $(( ${kb:-0} * 1024 )) "" "dry_run"
  else
    mkdir -p "$STAGE/static"
    tar -czf "$STAGE/static/$app.tar.gz" -C /opt "$app" 2>/dev/null \
      && manifest_add "$app" static "$src" "static/$app.tar.gz" 0 "" "ok" \
      || manifest_add "$app" static "$src" "" 0 "" "failed"
  fi
done

# --- 4) Empacota tudo --------------------------------------------------------
artifact="$OUT_DIR/configs-${BACKUP_STAMP}.tar.gz"
if is_dry_run; then
  log "DRY-RUN  empacotaria em $(basename "$artifact")"
else
  tar -czf "$artifact" -C "$(dirname "$STAGE")" "$(basename "$STAGE")" 2>/dev/null
  bytes="$(wc -c < "$artifact" | tr -d ' ')"
  sha="$(checksum "$artifact")"
  log "configs: ${bytes} bytes, sha256 ${sha:0:16}..."
  manifest_add "configs-bundle" config "$STAGE" "$(basename "$artifact")" "$bytes" "$sha" "ok"
  rm -rf "$STAGE"
fi

prune_old "$OUT_DIR" "*.tar.gz" "$BACKUP_RETENTION_DAYS"
backup_end
