#!/usr/bin/env bash
# =============================================================================
# setup-google-ads-credentials.sh — habilita a leitura ao vivo do Google Ads
# =============================================================================
# Faz tudo pela CLI, sem depender de automação de navegador:
#
#   1. instala o gcloud, se faltar
#   2. autentica (abre o navegador UMA vez, você clica e pronto)
#   3. cria a chave da conta de serviço direto no diretório protegido
#   4. aplica chmod 600
#   5. grava o developer token sem ecoar na tela
#   6. verifica, sem abrir o conteúdo de nada
#
# O valor da chave nunca aparece no terminal, nunca vai para o histórico do
# shell e nunca entra no repositório. O `gcloud` escreve o arquivo direto no
# destino final — não passa por Downloads.
#
# Uso:  bash scripts/setup-google-ads-credentials.sh
# =============================================================================
set -uo pipefail

PROJECT_ID="automatizador-ia-ads"
SA_EMAIL="google-ads-automation@${PROJECT_ID}.iam.gserviceaccount.com"
SECRET_DIR="${HOME}/Documents/Codex/.secrets/google-ads"
KEY_PATH="${SECRET_DIR}/service-account.json"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_DIR}/.env"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
info() { printf '  \033[34m·\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

echo "============================================================"
echo " Google Ads — configuração de credenciais"
echo " projeto: ${PROJECT_ID}"
echo "============================================================"

# --- 1) gcloud ---------------------------------------------------------------
step "1/6  gcloud"
if command -v gcloud >/dev/null 2>&1; then
  ok "gcloud presente ($(gcloud --version 2>/dev/null | head -1))"
else
  warn "gcloud ausente."
  command -v brew >/dev/null 2>&1 || die "Homebrew ausente. Instale em https://brew.sh e rode de novo."
  info "instalando via Homebrew (pode levar alguns minutos)..."
  brew install --cask google-cloud-sdk || die "falha ao instalar o gcloud"
  # O cask não põe no PATH da sessão atual.
  for p in \
    "/opt/homebrew/share/google-cloud-sdk/path.bash.inc" \
    "/usr/local/share/google-cloud-sdk/path.bash.inc" \
    "$(brew --prefix 2>/dev/null)/share/google-cloud-sdk/path.bash.inc"; do
    [ -f "$p" ] && . "$p" && break
  done
  command -v gcloud >/dev/null 2>&1 || die "gcloud instalado mas fora do PATH. Abra um terminal novo e rode de novo."
  ok "gcloud instalado"
fi

# --- 2) autenticação ---------------------------------------------------------
step "2/6  autenticação"
ACTIVE="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)"
if [ -n "$ACTIVE" ]; then
  ok "já autenticado como ${ACTIVE}"
  if [ "$ACTIVE" != "contato.automatizadoria@gmail.com" ]; then
    warn "conta ativa NÃO é contato.automatizadoria@gmail.com"
    warn "se der erro de permissão adiante, rode: gcloud auth login contato.automatizadoria@gmail.com"
  fi
else
  info "vai abrir o navegador — escolha contato.automatizadoria@gmail.com"
  gcloud auth login contato.automatizadoria@gmail.com || die "autenticação falhou"
  ok "autenticado"
fi

# --- 3) projeto --------------------------------------------------------------
step "3/6  projeto"
gcloud config set project "$PROJECT_ID" >/dev/null 2>&1 \
  || die "não foi possível selecionar o projeto ${PROJECT_ID}"
ok "projeto ${PROJECT_ID}"

if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  die "conta de serviço não encontrada ou sem permissão: ${SA_EMAIL}
     Confirme que a conta autenticada tem acesso ao projeto."
fi
ok "conta de serviço encontrada"

# --- 4) chave ----------------------------------------------------------------
step "4/6  chave da conta de serviço"
mkdir -p "$SECRET_DIR" && chmod 700 "$SECRET_DIR"
ok "diretório protegido: ${SECRET_DIR} (700)"

if [ -f "$KEY_PATH" ]; then
  warn "já existe uma chave em ${KEY_PATH}"
  read -r -p "  Substituir? Uma chave nova é criada e a antiga continua válida na nuvem. [s/N] " REPLACE
  case "$REPLACE" in
    s|S|y|Y) mv "$KEY_PATH" "${KEY_PATH}.bak-$(date +%Y%m%d%H%M%S)" ;;
    *) info "mantendo a chave existente" ;;
  esac
fi

if [ ! -f "$KEY_PATH" ]; then
  info "criando chave — o gcloud escreve DIRETO no destino, sem passar por Downloads"
  gcloud iam service-accounts keys create "$KEY_PATH" \
    --iam-account="$SA_EMAIL" >/dev/null 2>&1 \
    || die "falha ao criar a chave. Verifique a permissão iam.serviceAccountKeys.create."
  ok "chave criada"
fi
chmod 600 "$KEY_PATH"
ok "permissão 600 aplicada"

# --- 5) developer token ------------------------------------------------------
step "5/6  developer token"
if grep -qE '^GOOGLE_ADS_DEVELOPER_TOKEN=.+' "$ENV_FILE" 2>/dev/null; then
  ok "já presente no .env"
else
  echo "  Cole o developer token (NÃO aparece na tela)."
  echo "  Central de API do Google Ads. Se ainda não rotacionou, use \"Redefinir token\" antes."
  printf '  Token: '
  read -rs TOKEN; echo
  if [ -z "$TOKEN" ]; then
    warn "vazio — pulado. Grave depois com:"
    warn "  read -rs T && printf 'GOOGLE_ADS_DEVELOPER_TOKEN=%s\\n' \"\$T\" >> .env && unset T"
  else
    touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
    printf 'GOOGLE_ADS_DEVELOPER_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
    unset TOKEN
    ok "gravado em .env (600, fora do Git)"
  fi
fi

grep -qE '^GOOGLE_ADS_LOGIN_CUSTOMER_ID=' "$ENV_FILE" 2>/dev/null \
  || printf 'GOOGLE_ADS_LOGIN_CUSTOMER_ID=3992594849\n' >> "$ENV_FILE"
grep -qE '^GOOGLE_ADS_CUSTOMER_ID=' "$ENV_FILE" 2>/dev/null \
  || printf 'GOOGLE_ADS_CUSTOMER_ID=2656966896\n' >> "$ENV_FILE"
ok "IDs de conta registrados (não são segredo)"

# --- 6) verificação ----------------------------------------------------------
step "6/6  verificação"
info "lendo apenas metadados — o conteúdo da chave não é aberto"
( cd "$REPO_DIR" && node --import tsx -e "
import { describeCredentials, keyPermissionWarning } from './packages/integrations/src/google-ads/credential-provider.js';
const s = await describeCredentials();
console.log(JSON.stringify(s, null, 2));
const w = keyPermissionWarning(s);
if (w) console.log('AVISO:', w);
" 2>/dev/null ) || warn "verificação não rodou (rode 'npm ci' no repositório e tente de novo)"

echo
echo "============================================================"
echo " Pronto. Diga ao Claude: \"credenciais configuradas\""
echo "============================================================"
echo
warn "A chave antiga (28/07) continua válida na nuvem. Se não for mais usada,"
warn "remova em: gcloud iam service-accounts keys list --iam-account=${SA_EMAIL}"
