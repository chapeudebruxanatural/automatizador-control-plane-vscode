#!/usr/bin/env bash
# =============================================================================
# read-only-status.sh — status da VPS usando SOMENTE os comandos que o
# usuario operacional `automatizador` teria permissao de rodar via sudo
# =============================================================================
# Roda NA VPS, como o usuario `automatizador` (nao root).
#
# Este script existe para validar o modelo ANTES de criar o usuario real: cada
# linha abaixo usa exatamente um comando autorizado em
# infrastructure/vps/automatizador-sudoers.example. Se algum comando aqui
# falhar por falta de permissao depois que o usuario for criado, e o sudoers
# que esta incompleto — este script e o teste de aceitacao dele.
#
# Nao usa `docker exec`, `docker inspect`, nem qualquer subcomando mutante:
# nenhum deles esta na lista branca.
# =============================================================================
set -uo pipefail

SUDO="sudo -n"   # -n: nunca pede senha interativa. Se pedir, o modelo furou.

section() { echo; echo "### $1"; }

echo "############################################################"
echo "# STATUS DA VPS — usuario operacional (somente leitura)"
echo "# executado como: $(whoami)"
echo "# coletado em: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "############################################################"

section "identidade"
id
echo "aviso: se a linha acima mostrar uid=0, este script NAO esta rodando"
echo "como o usuario operacional — pare e corrija antes de prosseguir."

section "sistema"
$SUDO uptime -p
$SUDO free -h
$SUDO df -h -x tmpfs -x devtmpfs

section "rede (portas em escuta)"
$SUDO ss -tulpn

section "docker — containers"
$SUDO docker ps -a

section "docker — imagens"
$SUDO docker images

section "docker — uso de disco"
$SUDO docker system df

section "docker — swarm"
$SUDO docker service ls 2>/dev/null
$SUDO docker stack ls 2>/dev/null
$SUDO docker node ls 2>/dev/null

section "systemd — servicos ativos"
$SUDO systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | head -20

section "systemd — timers"
$SUDO systemctl list-timers --all --no-pager 2>/dev/null | head -15

section "cron (root)"
$SUDO crontab -l 2>/dev/null | grep -vE '^#'

echo
echo "############################################################"
echo "# FIM. Nenhum comando de escrita foi executado."
echo "# Se alguma secao acima falhou com 'a password is required',"
echo "# o sudoers instalado nao cobre aquele comando — corrigir o"
echo "# arquivo, nao adicionar senha interativa ao usuario."
echo "############################################################"
