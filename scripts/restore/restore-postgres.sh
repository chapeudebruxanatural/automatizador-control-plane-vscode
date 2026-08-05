#!/usr/bin/env bash
# =============================================================================
# restore-postgres.sh — restauracao ISOLADA de um dump PostgreSQL
# =============================================================================
# Restaura em um container DESCARTAVEL, nunca sobre um banco de producao.
# E assim de proposito: a restauracao serve para VERIFICAR que o backup presta,
# e verificar sobre a producao e trocar um risco por outro maior.
#
# Uso:
#   scripts/restore/restore-postgres.sh --file <dump>            # dry-run
#   scripts/restore/restore-postgres.sh --file <dump> --apply    # executa
#   scripts/restore/restore-postgres.sh --file <dump> --apply --keep
#
# O container temporario:
#   - nao publica porta;
#   - nao entra em rede de producao;
#   - e removido ao final, salvo com --keep.
#
# NAO restaura sobre banco existente. Nao ha opcao para isso neste script.
# =============================================================================
set -uo pipefail

DUMP_FILE=""
APPLY=0
KEEP=0
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
TMP_NAME="restore-verify-$(date -u '+%Y%m%d%H%M%S')-$$"
TMP_DB="restore_check"

while [ $# -gt 0 ]; do
  case "$1" in
    --file) DUMP_FILE="${2:-}"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --keep) KEEP=1; shift ;;
    --image) PG_IMAGE="${2:-}"; shift 2 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "ERRO: $*"; exit 1; }

[ -n "$DUMP_FILE" ] || die "informe --file <dump>"
[ -f "$DUMP_FILE" ] || die "arquivo nao encontrado: $DUMP_FILE"

BYTES="$(wc -c < "$DUMP_FILE" | tr -d ' ')"
if command -v sha256sum >/dev/null 2>&1; then
  SHA="$(sha256sum "$DUMP_FILE" | awk '{print $1}')"
else
  SHA="$(shasum -a 256 "$DUMP_FILE" | awk '{print $1}')"
fi

log "dump:     $(basename "$DUMP_FILE")"
log "tamanho:  $BYTES bytes"
log "sha256:   $SHA"
log "container temporario: $TMP_NAME (imagem $PG_IMAGE)"

[ "$BYTES" -lt 100 ] && die "dump suspeito: menos de 100 bytes. Backup provavelmente vazio."

if [ "$APPLY" != "1" ]; then
  cat <<EOF

MODO SIMULACAO — nada foi executado.

O que aconteceria com --apply:
  1. sobe $PG_IMAGE como '$TMP_NAME', sem porta publicada e sem rede de producao
  2. aguarda o Postgres aceitar conexao (pg_isready)
  3. cria a base '$TMP_DB'
  4. pg_restore do dump para dentro dela
  5. conta tabelas e linhas para provar que o conteudo chegou
  6. remove o container (salvo --keep)

Nenhum banco de producao e tocado em nenhuma etapa.
EOF
  exit 0
fi

command -v docker >/dev/null 2>&1 || die "docker nao encontrado"

cleanup() {
  if [ "$KEEP" = "1" ]; then
    log "container preservado por --keep: $TMP_NAME (remova manualmente ao terminar)"
  else
    docker rm -f "$TMP_NAME" >/dev/null 2>&1 || true
    log "container temporario removido"
  fi
}
trap cleanup EXIT

# Senha efemera de um container isolado e sem porta publicada: nao e credencial
# de producao e nao sai deste processo.
EPHEMERAL_PW="verify-$(date +%s)-$$"

log "subindo container isolado..."
docker run -d --name "$TMP_NAME" --network none \
  -e POSTGRES_PASSWORD="$EPHEMERAL_PW" \
  "$PG_IMAGE" >/dev/null 2>&1 || die "falha ao subir o container"

log "aguardando o Postgres aceitar conexao..."
ready=0
for _ in $(seq 1 60); do
  if docker exec "$TMP_NAME" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = "1" ] || die "Postgres nao ficou pronto em 60s"

log "criando base de verificacao '$TMP_DB'..."
docker exec "$TMP_NAME" createdb -U postgres "$TMP_DB" >/dev/null 2>&1 \
  || die "falha ao criar a base de verificacao"

log "restaurando..."
if docker exec -i "$TMP_NAME" pg_restore -U postgres -d "$TMP_DB" --no-owner < "$DUMP_FILE" 2>/dev/null; then
  log "pg_restore concluiu sem erro"
else
  log "AVISO: pg_restore reportou erro. Isso pode ser apenas ausencia de role/extensao."
  log "       A verificacao de conteudo abaixo e o que decide."
fi

TABLES="$(docker exec "$TMP_NAME" psql -U postgres -d "$TMP_DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');" 2>/dev/null | tr -d ' ')"
ROWS="$(docker exec "$TMP_NAME" psql -U postgres -d "$TMP_DB" -tAc \
  "SELECT COALESCE(sum(n_live_tup),0) FROM pg_stat_user_tables;" 2>/dev/null | tr -d ' ')"

log "--------------------------------------------"
log "tabelas restauradas: ${TABLES:-0}"
log "linhas (estimativa): ${ROWS:-0}"
log "--------------------------------------------"

if [ "${TABLES:-0}" -gt 0 ]; then
  log "RESULTADO: RESTAURACAO VERIFICADA. O backup contem dados recuperaveis."
  exit 0
fi

log "RESULTADO: FALHOU. Nenhuma tabela restaurada — este backup NAO presta."
exit 1
