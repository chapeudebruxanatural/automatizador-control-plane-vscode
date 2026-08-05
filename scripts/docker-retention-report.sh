#!/usr/bin/env bash
# =============================================================================
# docker-retention-report.sh — relatorio de imagens, SOMENTE LEITURA
# =============================================================================
# Mostra o que a politica atual (`docker image prune -af`) removeria e o que a
# politica proposta preservaria. NAO remove nada, em nenhuma circunstancia.
#
# Uso: scripts/docker-retention-report.sh [alias-ssh]
#      scripts/docker-retention-report.sh --local
# =============================================================================
set -uo pipefail

KEEP_PER_REPO="${KEEP_PER_REPO:-2}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-30}"

if [ "${1:-}" = "--local" ]; then
  RUN() { "$@"; }
else
  HOST="${1:-nvvps}"
  RUN() { ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" "$*"; }
fi

echo "=========================================================="
echo " RELATORIO DE RETENCAO DE IMAGENS — SOMENTE LEITURA"
echo " politica proposta: manter as $KEEP_PER_REPO mais recentes por repositorio"
echo "                    e nada com mais de $MAX_AGE_DAYS dias sem uso"
echo "=========================================================="
echo

echo "--- IMAGENS EM USO (nunca podem ser removidas) ---"
IN_USE="$(RUN 'docker ps --format "{{.Image}}" | sort -u')"
printf '%s\n' "$IN_USE" | sed 's/^/  /'
echo

echo "--- TODAS AS IMAGENS ---"
RUN 'docker images --format "{{.Repository}}|{{.Tag}}|{{.ID}}|{{.CreatedSince}}|{{.Size}}"' \
  | awk -F'|' '{printf "  %-42s %-14s %-14s %-16s %s\n", $1, $2, $3, $4, $5}'
echo

echo "--- DANGLING (sem tag) ---"
DANGLING="$(RUN 'docker images -f dangling=true --format "{{.ID}} {{.Size}} {{.CreatedSince}}"')"
if [ -z "$DANGLING" ]; then echo "  nenhuma"; else printf '%s\n' "$DANGLING" | sed 's/^/  /'; fi
echo

echo "--- ANALISE ---"
TOTAL="$(RUN 'docker images -q | wc -l' | tr -d ' ')"
DANG="$(RUN 'docker images -q -f dangling=true | wc -l' | tr -d ' ')"
USED="$(printf '%s\n' "$IN_USE" | grep -c . || true)"
echo "  imagens no total:      $TOTAL"
echo "  em uso por container:  $USED"
echo "  dangling:              $DANG"
echo

echo "--- O QUE A POLITICA ATUAL FARIA ---"
echo "  \`docker image prune -af\` remove TODA imagem sem container ativo,"
echo "  inclusive as TAGUEADAS. Estimativa de remocao agora:"
echo "  $((TOTAL - USED)) imagem(ns)."
echo
echo "  Consequencia: apos um deploy, a imagem anterior deixa de estar em uso"
echo "  e e removida na primeira janela seguinte — eliminando o alvo de"
echo "  \`docker service update --rollback\`, que o autodeploy usa."
echo

echo "--- O QUE A POLITICA PROPOSTA FARIA ---"
echo "  1. nunca remove imagem em uso;"
echo "  2. mantem as $KEEP_PER_REPO mais recentes por repositorio (rollback preservado);"
echo "  3. remove dangling com mais de $MAX_AGE_DAYS dias;"
echo "  4. relata antes de remover;"
echo "  5. exige aprovacao explicita para remover."
echo
echo "Nenhuma alteracao foi feita. Este script apenas relata."
