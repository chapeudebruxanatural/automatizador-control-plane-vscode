#!/usr/bin/env bash
# =============================================================================
# google-ads-monitor.sh — monitoramento da campanha do Cássio
# =============================================================================
# SOMENTE LEITURA. Nenhum mutate. Roda a cada 12h.
#
# Alerta quando:
#   · CPC do dia > R$ 1,00 (sinal de que esta comprando clique caro)
#   · gasto acumulado > R$ 400 (teto de alerta, antes do limite de R$ 472,94)
#   · > R$ 100 gastos no dia sem nenhum WhatsApp novo
# =============================================================================
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
exec node --import tsx scripts/google-ads-monitor.mts "$@"
