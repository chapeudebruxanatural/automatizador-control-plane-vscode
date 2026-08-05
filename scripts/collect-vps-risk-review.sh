#!/usr/bin/env bash
# =============================================================================
# collect-vps-risk-review.sh — investigacao de risco, SOMENTE LEITURA
# =============================================================================
# Complementa collect-vps-inventory.sh com o que e preciso para avaliar risco:
# crescimento de disco, tamanho de volumes, politica de poda, backups,
# duplicidade de servicos e estado do sistema operacional.
#
# Reusa o mesmo guarda do coletor principal: nenhum comando mutante ou
# revelador de segredo e enviado a VPS.
#
# Uso: scripts/collect-vps-risk-review.sh [alias-ssh] > /tmp/vps-risk.txt
# =============================================================================
set -uo pipefail

HOST="${1:-nvvps}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Carrega a mesma politica de recusa do coletor principal. Uma unica definicao
# evita que as duas divirjam com o tempo.
# shellcheck disable=SC1090
eval "$(grep -E '^DENY_(MUTATION|SECRET)(\+)?=' "$SCRIPT_DIR/collect-vps-inventory.sh")"

ro() {
  local label="$1" cmd="$2"
  local probe="${cmd//2>\/dev\/null/}"
  probe="${probe//&>\/dev\/null/}"
  probe="${probe//>\/dev\/null/}"
  probe="${probe//2>&1/}"

  echo "### $label"
  if printf '%s' "$probe" | grep -qE "$DENY_MUTATION"; then
    echo "RECUSADO: comando mutante bloqueado localmente."; echo; return 1
  fi
  if printf '%s' "$probe" | grep -qE "$DENY_SECRET"; then
    echo "RECUSADO: risco de exposicao de segredo."; echo; return 1
  fi
  ssh "${SSH_OPTS[@]}" "$HOST" "$cmd" 2>&1 || echo "(indisponivel)"
  echo
}

##
# Leitura das regras de roteamento do Traefik.
#
# `docker service inspect` e bloqueado pelo guarda por expor variaveis de
# ambiente. Aqui a projecao e FIXA e esta escrita no proprio codigo: so
# `.Spec.Labels`, e so as linhas de regra de roteador. Nao ha parametro que
# permita ampliar o que e impresso, entao a funcao nao pode ser reaproveitada
# para vazar env. E o unico ponto do projeto autorizado a usar inspect, e o
# motivo esta aqui.
##
ro_traefik_rules() {
  echo "### regras de roteamento traefik (projecao fixa: apenas labels)"
  ssh "${SSH_OPTS[@]}" "$HOST" '
    for s in $(docker service ls --format "{{.Name}}" 2>/dev/null); do
      rules=$(docker service inspect "$s" \
        --format "{{range \$k,\$v := .Spec.Labels}}{{\$k}}={{\$v}}
{{end}}" 2>/dev/null | grep -iE "traefik\.http\.routers\..*\.rule=")
      [ -n "$rules" ] && { echo "== $s"; echo "$rules"; }
    done
  ' 2>&1 || echo "(indisponivel)"
  echo
}

echo "############################################################"
echo "# REVISAO DE RISCO DA VPS — SOMENTE LEITURA"
echo "# host: $HOST   coletado em: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "############################################################"
echo

# --- Espaco e crescimento ----------------------------------------------------
ro "disco raiz"      'df -h / | tail -1'
ro "inodes"          'df -i / | tail -1'
ro "docker disk"     'docker system df'
ro "docker disk detalhado" 'docker system df -v 2>/dev/null | head -60'
ro "tamanho volumes" 'timeout 120 du -sh /var/lib/docker/volumes/*/ 2>/dev/null | sort -rh | head -25'
ro "maiores dirs /var/lib/docker" 'timeout 90 du -sh /var/lib/docker/* 2>/dev/null | sort -rh'
ro "tamanho /root e /opt" 'timeout 60 du -sh /root /opt 2>/dev/null; timeout 60 du -sh /root/* 2>/dev/null | sort -rh | head -15'

# --- Politica de poda --------------------------------------------------------
ro "cron root completo" 'crontab -l 2>/dev/null'
ro "cron.d docker-image-prune" 'cat /etc/cron.d/docker-image-prune 2>/dev/null'
ro "outros cron de usuarios" 'for u in $(cut -d: -f1 /etc/passwd); do c=$(crontab -u "$u" -l 2>/dev/null); [ -n "$c" ] && echo "== $u"; done'
ro "systemd timers"  'systemctl list-timers --all --no-pager 2>/dev/null | head -20'
ro "logs de prune"   'ls -lh /var/log/novacena-docker-prune.log /var/log/novacena*.log 2>/dev/null; echo "--- ultimas linhas ---"; tail -15 /var/log/novacena-docker-prune.log 2>/dev/null'

# --- Imagens: referenciadas vs orfas ----------------------------------------
ro "imagens em uso"  'docker ps --format "{{.Image}}" | sort -u'
ro "imagens dangling" 'docker images -f dangling=true --format "{{.ID}}\t{{.Size}}\t{{.CreatedSince}}" | head -20'
ro "contagem imagens" 'echo "total: $(docker images -q | wc -l)"; echo "dangling: $(docker images -q -f dangling=true | wc -l)"'
ro "imagens por servico swarm" 'docker service ls --format "{{.Name}}\t{{.Image}}" 2>/dev/null'

# --- Backups: existe destino externo? ---------------------------------------
ro "ferramentas de backup" 'for b in rclone restic borg borgmatic duplicity aws b2 s3cmd mc pg_dump pgbackrest; do printf "%s: " "$b"; command -v "$b" >/dev/null 2>&1 && echo "instalado" || echo "ausente"; done'
ro "montagens externas" 'mount | grep -viE "^(proc|sysfs|tmpfs|devtmpfs|cgroup|overlay|nsfs|devpts|securityfs|debugfs|mqueue|hugetlbfs|configfs|fusectl|pstore|bpf|tracefs|binfmt)" | head -20'
ro "dispositivos de bloco" 'lsblk 2>/dev/null'
ro "snapshots em /root/backups" 'ls -lhR /root/backups 2>/dev/null | head -40'
ro "dados_vps" 'ls -lh /root/dados_vps 2>/dev/null; echo "--- tamanho ---"; timeout 60 du -sh /root/dados_vps/* 2>/dev/null | sort -rh'
ro "config rclone existe?" 'ls -la /root/.config/rclone 2>/dev/null | wc -l'
ro "scripts em /root/scripts" 'ls -la /root/scripts 2>/dev/null; echo "--- cabecalhos ---"; head -12 /root/scripts/*.sh 2>/dev/null'

# --- Sistema operacional -----------------------------------------------------
ro "versao debian"   'cat /etc/debian_version; lsb_release -a 2>/dev/null'
ro "reboot pendente" 'ls -la /var/run/reboot-required* 2>/dev/null || echo "sem flag de reboot pendente"'
ro "kernel atual vs instalado" 'uname -r; echo "--- instalados ---"; dpkg -l | grep -E "^ii\s+linux-image" | awk "{print \$2, \$3}"'
ro "pacotes atualizaveis" 'apt list --upgradable 2>/dev/null | head -25'
ro "atualizacoes de seguranca pendentes" 'apt list --upgradable 2>/dev/null | grep -ci security'
ro "unattended-upgrades log" 'tail -12 /var/log/unattended-upgrades/unattended-upgrades.log 2>/dev/null'
ro "fim de suporte apt" 'grep -rhE "^deb " /etc/apt/sources.list /etc/apt/sources.list.d/ 2>/dev/null | head -10'

# --- Rede: interfaces das portas do Swarm -----------------------------------
ro "portas swarm detalhado" 'ss -tulpn 2>/dev/null | grep -E "2377|7946|4789"'
ro "interfaces de rede" 'ip -br addr 2>/dev/null'
ro "firewall ativo?" 'command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null || echo "ufw ausente"; echo "--- iptables (contagem de regras) ---"; iptables -S 2>/dev/null | wc -l; echo "--- politica das chains ---"; iptables -S 2>/dev/null | grep -E "^-P"'
ro "swarm info" 'docker node ls 2>/dev/null; docker info --format "Swarm: {{.Swarm.LocalNodeState}} | Managers: {{.Swarm.Managers}} | Nodes: {{.Swarm.Nodes}}" 2>/dev/null'

# --- Duplicidade e proxy -----------------------------------------------------
ro "novacena-music swarm" 'docker service ps novacena_music_backend novacena_music_frontend novacena_music_nginx --format "{{.Name}}\t{{.CurrentState}}\t{{.Image}}" 2>/dev/null'
ro "novacena-music compose" 'docker compose -f /opt/novacena-music/docker-compose.yml ps 2>/dev/null'
ro_traefik_rules

echo "############################################################"
echo "# FIM — nenhuma alteracao foi feita na VPS."
echo "############################################################"
