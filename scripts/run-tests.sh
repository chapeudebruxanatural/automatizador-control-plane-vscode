#!/usr/bin/env bash
# =============================================================================
# run-tests.sh — descobre e executa a suíte, recusando suíte vazia
# =============================================================================
# O script anterior era `node --import tsx --test $(find ...)`. Quando o find
# não retornava nada, o `node --test` rodava sem argumentos, não encontrava
# teste algum e **saía com código 0** — o CI ficava verde sem executar um
# único teste.
#
# Isso não é hipotético neste repositório: uma regra de `.gitignore` já
# engoliu um diretório inteiro em silêncio (ver DECISIONS.md, 2026-08-05). Se
# tivesse pego `tests/`, toda a rede de segurança teria sumido sem sinal.
#
# Aqui a descoberta vazia é erro, e há um piso mínimo de arquivos esperados —
# para que apagar metade da suíte também seja detectado, não só apagar tudo.
# =============================================================================
set -uo pipefail

TESTS_DIR="${TESTS_DIR:-tests}"
# Piso conservador: menor que o número atual de arquivos, para não exigir
# atualização a cada teste novo, mas alto o bastante para pegar perda em massa.
MIN_TEST_FILES="${MIN_TEST_FILES:-5}"

if [ ! -d "$TESTS_DIR" ]; then
  echo "ERRO: diretório de testes '$TESTS_DIR' não existe." >&2
  echo "A suíte não pode ser considerada aprovada sem ela." >&2
  exit 1
fi

# shellcheck disable=SC2207
FILES=($(find "$TESTS_DIR" -name '*.test.ts' -type f | sort))
COUNT=${#FILES[@]}

if [ "$COUNT" -eq 0 ]; then
  echo "ERRO: nenhum arquivo *.test.ts encontrado em '$TESTS_DIR'." >&2
  echo "Suíte vazia é reprovação, não aprovação silenciosa." >&2
  exit 1
fi

if [ "$COUNT" -lt "$MIN_TEST_FILES" ]; then
  echo "ERRO: encontrados $COUNT arquivo(s) de teste, mínimo esperado é $MIN_TEST_FILES." >&2
  echo "Se a redução foi intencional, ajuste MIN_TEST_FILES conscientemente." >&2
  exit 1
fi

echo "Executando $COUNT arquivo(s) de teste de '$TESTS_DIR':"
printf '  %s\n' "${FILES[@]}"
echo

exec node --import tsx --test "${FILES[@]}"
