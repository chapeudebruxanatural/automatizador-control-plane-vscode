#!/usr/bin/env bash
# =============================================================================
# scan-secrets.sh — detector de padroes comuns de segredo
# =============================================================================
# Primeira linha de defesa antes de um commit. Reporta ARQUIVO, LINHA e TIPO
# PROVAVEL. NUNCA imprime o valor encontrado.
#
# Uso:
#   scripts/scan-secrets.sh              # varre arquivos em stage (pre-commit)
#   scripts/scan-secrets.sh --all        # varre todos os arquivos rastreados
#   scripts/scan-secrets.sh --files a b  # varre arquivos especificos
#
# Saida: 0 = limpo, 1 = achados, 2 = erro de uso.
#
# Escape consciente: uma linha marcada com "pragma: allowlist-secret" e
# ignorada. Use apenas quando tiver certeza de que nao ha segredo real.
# =============================================================================
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" || exit 2

MODE="staged"
EXPLICIT_FILES=()

case "${1:-}" in
  --all)   MODE="all" ;;
  --files) MODE="files"; shift; EXPLICIT_FILES=("$@") ;;
  --staged|"") MODE="staged" ;;
  -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
  *) echo "uso: $0 [--staged|--all|--files <arquivos...>]" >&2; exit 2 ;;
esac

# --- Selecao de arquivos -----------------------------------------------------
collect_files() {
  case "$MODE" in
    staged) git diff --cached --name-only --diff-filter=ACM 2>/dev/null ;;
    all)    git ls-files 2>/dev/null ;;
    files)  printf '%s\n' "${EXPLICIT_FILES[@]}" ;;
  esac
}

# Arquivos que documentam ou implementam os proprios padroes: nao escanear
# conteudo, senao o detector acusa a si mesmo.
is_self_referential() {
  case "$1" in
    scripts/scan-secrets.sh|docs/security/secrets-policy.md) return 0 ;;
    *) return 1 ;;
  esac
}

# --- Nomes de arquivo proibidos ---------------------------------------------
# Arquivos que nunca devem entrar no repositorio, independente do conteudo.
FORBIDDEN_NAMES='(^|/)(\.env(\..+)?|.*\.pem|.*\.p12|.*\.pfx|.*\.jks|.*\.keystore|id_rsa.*|id_ed25519.*|.*\.kdbx|credentials\.json|client_secret.*\.json|service-account.*\.json)$'
ALLOWED_NAMES='(^|/)\.env\.example$'

# --- Padroes de conteudo -----------------------------------------------------
# Formato: "TIPO PROVAVEL::regex estendida"
PATTERNS=(
  "chave privada (PEM/OpenSSH)::-----BEGIN [A-Z ]*PRIVATE KEY-----"
  "GitHub token (classico ou fine-grained)::(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})"
  "Anthropic API key::sk-ant-[A-Za-z0-9_-]{20,}"
  "OpenAI API key::sk-(proj-)?[A-Za-z0-9_-]{24,}"
  "AWS access key id::(A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}"
  "Google API key::AIza[0-9A-Za-z_-]{35}"
  "Google OAuth client secret::GOCSPX-[A-Za-z0-9_-]{20,}"
  "Meta/Facebook access token::EAA[A-Za-z0-9]{40,}"
  "Slack token::xox[abprs]-[A-Za-z0-9-]{10,}"
  "Stripe secret key::(sk|rk)_(live|test)_[A-Za-z0-9]{16,}"
  "SendGrid API key::SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"
  "Twilio account sid::AC[a-f0-9]{32}"
  "JSON Web Token::eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\."
  "URL de conexao com credencial embutida::(postgres|postgresql|mysql|mongodb(\+srv)?|redis|amqp|ftp|ssh)://[^:@/[:space:]]+:[^@/[:space:]]+@"
  "atribuicao de senha/segredo/token::(^|[^A-Za-z0-9_])(password|passwd|senha|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret|refresh[_-]?token)[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9_/+.=-]{12,}"
  "credencial em linha de comando::--(password|token|api-key|secret)[= ][A-Za-z0-9_/+.=-]{8,}"
)

# --- Placeholders aceitos ----------------------------------------------------
# Linhas que casam com isto sao tratadas como exemplo/documentacao.
PLACEHOLDER='(<[A-Za-z0-9_ .-]+>|\$\{[A-Za-z0-9_]+\}|\$[A-Z_]{3,}|CHANGE_?ME|changeme|[Yy]our[-_ ]|EXAMPLE|example|PLACEHOLDER|placeholder|REDACTED|redacted|xxxx|XXXX|\*\*\*|dummy|DUMMY|sample|SAMPLE|TODO|FIXME|f[o0]{2}bar|abc123|process\.env\.|pragma: allowlist-secret)'

# =============================================================================
FINDINGS=0
SCANNED=0

while IFS= read -r file; do
  [ -z "$file" ] && continue
  [ -f "$file" ] || continue

  # 1) Nome de arquivo proibido
  if printf '%s' "$file" | grep -qE "$FORBIDDEN_NAMES" \
     && ! printf '%s' "$file" | grep -qE "$ALLOWED_NAMES"; then
    echo "[BLOQUEIO] $file — arquivo de credencial/ambiente nao deve ser versionado"
    echo "           acao: remova do stage (git rm --cached) e confirme o .gitignore"
    FINDINGS=$((FINDINGS + 1))
    continue
  fi

  is_self_referential "$file" && continue

  SCANNED=$((SCANNED + 1))

  # 2) Padroes de conteudo
  for entry in "${PATTERNS[@]}"; do
    label="${entry%%::*}"
    regex="${entry#*::}"

    # -I ignora binarios, -n numera linhas. Cortamos o conteudo antes de exibir.
    # -e e obrigatorio: padroes que comecam com "-" (chave PEM, flags de CLI)
    # seriam interpretados como opcoes do grep sem ele.
    hits="$(grep -nEI -e "$regex" "$file" 2>/dev/null || true)"
    [ -z "$hits" ] && continue

    while IFS= read -r hit; do
      [ -z "$hit" ] && continue
      lineno="${hit%%:*}"
      content="${hit#*:}"
      # Placeholder reconhecido -> nao e achado
      printf '%s' "$content" | grep -qE "$PLACEHOLDER" && continue
      echo "[SUSPEITA] $file:$lineno — $label"
      echo "           acao: mova o valor para .env (nao versionado) e rotacione se ja exposto"
      FINDINGS=$((FINDINGS + 1))
    done <<< "$hits"
  done
done <<< "$(collect_files)"

echo "---"
echo "scan-secrets: $SCANNED arquivo(s) analisado(s), $FINDINGS achado(s)."

if [ "$FINDINGS" -gt 0 ]; then
  echo "Commit bloqueado. Nenhum valor foi impresso, por politica."
  echo "Revise manualmente os arquivos listados. Consulte docs/security/secrets-policy.md."
  exit 1
fi

exit 0
