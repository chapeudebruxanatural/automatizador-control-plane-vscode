#!/usr/bin/env bash
# =============================================================================
# collect-vps-inventory.sh — inventario SOMENTE LEITURA da VPS
# =============================================================================
# Uso:
#   scripts/collect-vps-inventory.sh [alias-ssh] > /tmp/vps-inventory.txt
#
# Toda consulta passa pela funcao ro(), que RECUSA em tempo de execucao
# qualquer comando contendo verbo mutante ou revelador de segredo. A politica
# de leitura fica no codigo, nao apenas na documentacao.
#
# Deliberadamente nao escreve no repositorio: a sanitizacao e a interpretacao
# dos resultados sao humanas.
# =============================================================================
set -uo pipefail

HOST="${1:-nvvps}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)

# --- Verbos proibidos --------------------------------------------------------
# Mutacao de estado.
DENY_MUTATION='(^|[^a-z])(rm|rmdir|mv|cp|dd|mkfs|chmod|chown|truncate|tee|shutdown|reboot|halt|poweroff)([^a-z]|$)'
DENY_MUTATION+='|docker[[:space:]]+(run|exec|start|stop|restart|kill|rm|rmi|prune|build|pull|push|create|update|commit|cp|load|import|tag|login)'
DENY_MUTATION+='|docker[[:space:]]+(system|image|container|volume|network|builder)[[:space:]]+prune'
DENY_MUTATION+='|docker[[:space:]]+compose[[:space:]]+(up|down|restart|stop|start|pull|build|rm|exec|run)'
DENY_MUTATION+='|systemctl[[:space:]]+(start|stop|restart|reload|enable|disable|mask|unmask|kill|edit|set-)'
DENY_MUTATION+='|(apt|apt-get|yum|dnf|apk|snap|pip|pip3|npm|yarn|pnpm)[[:space:]]+(install|remove|purge|upgrade|update)'
DENY_MUTATION+='|(ufw|iptables|nft|firewall-cmd)[[:space:]]+'
# A flag precisa ser um token isolado: sem isso, o "-c" dentro de "redis-cli"
# faz a propria deteccao de runtimes ser recusada.
DENY_MUTATION+='|(psql|mysql|mongosh?|redis-cli)[[:space:]]([^|;]*[[:space:]])?(-c|--eval|--command)([[:space:]=]|$)'
DENY_MUTATION+='|crontab[[:space:]]+-[re]'
# Redirecionamento para arquivo. `2>/dev/null` e `>/dev/null` sao descartados
# antes da checagem (ver funcao ro), por serem descarte, nao escrita.
DENY_MUTATION+='|>[^>]|>>|\bsed\b[[:space:]]+-i|\bkill\b|\bpkill\b'

# Exposicao de segredo.
DENY_SECRET='(cat|less|more|head|tail|grep|awk|strings|xxd|base64)[^|;]*\.env'
DENY_SECRET+='|\b(printenv|env)\b[[:space:]]*$|^[[:space:]]*env[[:space:]]'
DENY_SECRET+='|docker[[:space:]]+inspect'
DENY_SECRET+='|docker[[:space:]]+compose[[:space:]]+config'
DENY_SECRET+='|id_rsa|id_ed25519|authorized_keys|shadow|privkey|\.key'
# Certificado publico (cert.pem) pode ter validade lida com `openssl -noout`,
# mas nunca despejado na integra.
DENY_SECRET+='|(cat|less|more|head|tail|strings|base64)[^|;]*\.pem'

ro() {
  local label="$1" cmd="$2"

  # Redirecionamentos benignos (descarte de stream e fusao de stderr em stdout)
  # nao escrevem em lugar nenhum. Removidos antes de avaliar a politica, senao
  # o guarda recusa as proprias consultas de leitura.
  local probe="${cmd//2>\/dev\/null/}"
  probe="${probe//&>\/dev\/null/}"
  probe="${probe//>\/dev\/null/}"
  probe="${probe//2>&1/}"

  if printf '%s' "$probe" | grep -qE "$DENY_MUTATION"; then
    echo "### $label"
    echo "RECUSADO pelo guarda: comando contem verbo mutante." >&2
    echo "RECUSADO: comando mutante bloqueado localmente, nao foi enviado a VPS."
    echo
    return 1
  fi
  if printf '%s' "$probe" | grep -qE "$DENY_SECRET"; then
    echo "### $label"
    echo "RECUSADO pelo guarda: comando poderia expor segredo." >&2
    echo "RECUSADO: comando com risco de exposicao, nao foi enviado a VPS."
    echo
    return 1
  fi

  echo "### $label"
  ssh "${SSH_OPTS[@]}" "$HOST" "$cmd" 2>&1 || echo "(comando falhou ou indisponivel)"
  echo
}

echo "############################################################"
echo "# INVENTARIO VPS — SOMENTE LEITURA"
echo "# host alias: $HOST"
echo "# coletado em: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "############################################################"
echo

# --- Sistema -----------------------------------------------------------------
ro "hostname"        'hostname'
ro "os"              'cat /etc/os-release 2>/dev/null | head -4; uname -sr'
ro "uptime"          'uptime'
ro "cpu"             'nproc; lscpu 2>/dev/null | grep -E "^(Model name|CPU\(s\)|Architecture)" | head -4'
ro "memoria"         'free -h'
ro "disco"           'df -h -x tmpfs -x devtmpfs'
ro "carga"           'cat /proc/loadavg'

# --- Docker ------------------------------------------------------------------
ro "docker versao"   'docker --version; docker compose version'
ro "containers"      'docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.Ports}}"'
ro "containers erro" 'docker ps -a --filter "status=exited" --filter "status=dead" --filter "status=restarting" --format "{{.Names}}\t{{.Status}}"'
ro "imagens"         'docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}"'
ro "redes"           'docker network ls --format "{{.Name}}\t{{.Driver}}\t{{.Scope}}"'
ro "volumes"         'docker volume ls --format "{{.Name}}\t{{.Driver}}"'
ro "projetos compose" 'docker compose ls --all 2>/dev/null'
ro "swarm stacks"    'docker stack ls 2>/dev/null'
ro "swarm services"  'docker service ls --format "{{.Name}}\t{{.Mode}}\t{{.Replicas}}\t{{.Image}}" 2>/dev/null'
ro "swarm nodes"     'docker node ls 2>/dev/null'
ro "uso de recursos" 'docker stats --no-stream --format "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"'

# --- Rede e processos --------------------------------------------------------
ro "portas em escuta" 'ss -tulpn 2>/dev/null | head -40'
ro "processos"        'ps aux --sort=-%mem | head -15'

# --- Servicos ----------------------------------------------------------------
ro "systemd ativos"  'systemctl list-units --type=service --state=running --no-pager --no-legend | head -30'
ro "systemd falhos"  'systemctl list-units --type=service --state=failed --no-pager --no-legend'
ro "cron root"       'crontab -l 2>/dev/null | grep -vE "^#" | cut -c1-120'
ro "cron sistema"    'ls -1 /etc/cron.d /etc/cron.daily 2>/dev/null'

# --- Runtimes e proxies ------------------------------------------------------
ro "runtimes"        'for b in node npm python3 pm2 nginx caddy traefik cloudflared psql mysql redis-cli git; do printf "%s: " "$b"; command -v "$b" >/dev/null 2>&1 && ($b --version 2>&1 | head -1) || echo "nao instalado"; done'
ro "pm2"             'pm2 list --no-color 2>/dev/null | head -20'
ro "nginx sites"     'ls -1 /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null'

# --- Certificados (apenas dominio e validade) --------------------------------
ro "certificados"    'ls -1 /etc/letsencrypt/live 2>/dev/null | grep -v README'
ro "validade certs"  'for d in /etc/letsencrypt/live/*/; do n=$(basename "$d"); [ "$n" = "*" ] && continue; printf "%s: " "$n"; openssl x509 -noout -enddate -in "$d/cert.pem" 2>/dev/null || echo "indisponivel"; done'

# --- Diretorios de aplicacao (apenas nomes e tamanhos) -----------------------
ro "apps /opt"       'ls -1 /opt 2>/dev/null | head -30'
ro "apps /srv"       'ls -1 /srv 2>/dev/null | head -30'
ro "apps /root"      'ls -1 /root 2>/dev/null | head -30'
ro "apps /home"      'ls -1 /home 2>/dev/null | head -20'

# --- Backups (apenas caminho, data e tamanho) --------------------------------
ro "backups"         'for d in /backup /backups /var/backups /opt/backup /root/backup; do [ -d "$d" ] && { echo "== $d"; ls -lh "$d" 2>/dev/null | head -12; }; done; echo "(fim)"'

echo "############################################################"
echo "# FIM — nenhuma alteracao foi feita na VPS."
echo "############################################################"
