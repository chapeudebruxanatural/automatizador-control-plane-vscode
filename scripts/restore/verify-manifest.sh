#!/usr/bin/env bash
# =============================================================================
# verify-manifest.sh — confere os artefatos de um backup contra seu manifest
# =============================================================================
# Recalcula o sha256 de cada artefato e compara com o registrado. Detecta
# corrupcao silenciosa e arquivo truncado — as duas formas mais comuns de um
# backup "existir" e nao servir.
#
# Uso:
#   scripts/restore/verify-manifest.sh --manifest <arquivo.json> [--dir <artefatos>]
#
# Nao modifica nada. Saida 0 = integro, 1 = divergencia.
# =============================================================================
set -uo pipefail

MANIFEST=""
ART_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --manifest) MANIFEST="${2:-}"; shift 2 ;;
    --dir) ART_DIR="${2:-}"; shift 2 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

[ -n "$MANIFEST" ] || { echo "informe --manifest <arquivo.json>" >&2; exit 2; }
[ -f "$MANIFEST" ] || { echo "manifest nao encontrado: $MANIFEST" >&2; exit 2; }
[ -n "$ART_DIR" ] || ART_DIR="$(dirname "$MANIFEST")"

command -v node >/dev/null 2>&1 || { echo "node necessario para ler o manifest" >&2; exit 2; }

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

STAMP="$(node -e "console.log(require('$MANIFEST').stamp||'?')" 2>/dev/null)"
DRY="$(node -e "console.log(require('$MANIFEST').dryRun===true)" 2>/dev/null)"

echo "manifest: $MANIFEST"
echo "stamp:    $STAMP"
echo "dry-run:  $DRY"
echo "dir:      $ART_DIR"
echo "----------------------------------------"

if [ "$DRY" = "true" ]; then
  echo "Este manifest e de uma execucao em DRY-RUN: nao ha artefato para conferir."
  echo "Rode o backup com --apply antes de verificar."
  exit 0
fi

ok=0; bad=0; missing=0; skipped=0

while IFS='|' read -r name artifact expected status; do
  [ -z "$name" ] && continue

  case "$status" in
    excluded|skipped_not_found|skipped_container_not_found|skipped_no_databases|dry_run)
      printf '  %-45s  %s\n' "$name" "(ignorado: $status)"; skipped=$((skipped+1)); continue ;;
  esac

  if [ -z "$artifact" ]; then
    printf '  %-45s  SEM ARTEFATO (status=%s)\n' "$name" "$status"; missing=$((missing+1)); continue
  fi

  path="$ART_DIR/$artifact"
  if [ ! -f "$path" ]; then
    printf '  %-45s  ARQUIVO AUSENTE: %s\n' "$name" "$artifact"; missing=$((missing+1)); continue
  fi

  if [ -z "$expected" ]; then
    printf '  %-45s  sem checksum registrado\n' "$name"; skipped=$((skipped+1)); continue
  fi

  actual="$(checksum "$path")"
  if [ "$actual" = "$expected" ]; then
    printf '  %-45s  OK   %s...\n' "$name" "${actual:0:16}"; ok=$((ok+1))
  else
    printf '  %-45s  DIVERGENTE\n' "$name"
    printf '  %-45s    esperado %s...\n' "" "${expected:0:16}"
    printf '  %-45s    obtido   %s...\n' "" "${actual:0:16}"
    bad=$((bad+1))
  fi
done < <(node -e "
  const m = require('$MANIFEST');
  for (const i of (m.items||[])) {
    console.log([i.name||'', i.artifact||'', i.sha256||'', i.status||''].join('|'));
  }
" 2>/dev/null)

echo "----------------------------------------"
echo "integros: $ok | divergentes: $bad | ausentes: $missing | ignorados: $skipped"

if [ "$bad" -gt 0 ] || [ "$missing" -gt 0 ]; then
  echo "RESULTADO: FALHOU. Este backup nao pode ser considerado confiavel."
  exit 1
fi

if [ "$ok" -eq 0 ]; then
  echo "RESULTADO: INCONCLUSIVO. Nenhum artefato foi conferido."
  exit 1
fi

echo "RESULTADO: INTEGRO. $ok artefato(s) conferem com o manifest."
echo "Atencao: integridade nao e restaurabilidade. Use restore-postgres.sh para provar."
exit 0
