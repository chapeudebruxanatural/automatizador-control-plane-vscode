#!/usr/bin/env bash
# =============================================================================
# collect-github-inventory.sh — coleta metadados dos repositorios via gh CLI
# =============================================================================
# SOMENTE LEITURA. Nao clona, nao modifica, nao le secrets.
# Usa apenas metadados e a listagem de arquivos na raiz do branch padrao.
#
# Uso:
#   scripts/collect-github-inventory.sh [owner] > /tmp/gh-inventory.json
#
# A saida (JSON em stdout) alimenta a atualizacao manual de
# inventory/repositories.yaml. Deliberadamente nao escreve no repositorio:
# a curadoria de "provavel cliente" e humana, nao automatica.
# =============================================================================
set -uo pipefail

OWNER="${1:-dadocruz}"

command -v gh >/dev/null 2>&1 || { echo "gh CLI nao encontrado" >&2; exit 2; }
gh auth status >/dev/null 2>&1 || { echo "gh CLI nao autenticado" >&2; exit 2; }

repos="$(gh repo list "$OWNER" --limit 200 --json name --jq '.[].name')"

echo "["
first=1
while IFS= read -r repo; do
  [ -z "$repo" ] && continue
  [ $first -eq 0 ] && echo ","
  first=0

  meta="$(gh api "repos/$OWNER/$repo" 2>/dev/null)"
  [ -z "$meta" ] && { echo "{\"name\":\"$repo\",\"error\":\"metadata unavailable\"}"; continue; }

  branch="$(printf '%s' "$meta" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).default_branch||"")}catch{console.log("")}})')"

  # Arquivos na raiz do branch padrao (nao recursivo: barato e suficiente)
  tree="$(gh api "repos/$OWNER/$repo/git/trees/$branch" --jq '[.tree[].path]' 2>/dev/null || echo '[]')"

  # Workflows do GitHub Actions
  wf="$(gh api "repos/$OWNER/$repo/actions/workflows" --jq '[.workflows[]?.name]' 2>/dev/null || echo '[]')"

  # GitHub Pages: 404 significa ausente
  if gh api "repos/$OWNER/$repo/pages" >/dev/null 2>&1; then pages=true; else pages=false; fi

  envs="$(gh api "repos/$OWNER/$repo/environments" --jq '[.environments[]?.name]' 2>/dev/null || echo '[]')"

  printf '%s' "$meta" | node -e '
    let d = "";
    process.stdin.on("data", c => d += c).on("end", () => {
      const m = JSON.parse(d);
      const tree = JSON.parse(process.argv[1] || "[]");
      const wf   = JSON.parse(process.argv[2] || "[]");
      const envs = JSON.parse(process.argv[4] || "[]");
      const has = (re) => tree.some(p => re.test(p));
      console.log(JSON.stringify({
        name: m.name,
        url: m.html_url,
        visibility: m.private ? "private" : "public",
        description: m.description,
        primaryLanguage: m.language,
        defaultBranch: m.default_branch,
        updatedAt: m.pushed_at,
        createdAt: m.created_at,
        sizeKb: m.size,
        archived: m.archived,
        topics: m.topics || [],
        hasReadme: has(/^readme(\.|$)/i),
        hasPackageJson: tree.includes("package.json"),
        hasDockerfile: has(/^dockerfile/i),
        hasCompose: has(/^(docker-)?compose\.ya?ml$/i),
        hasCI: tree.includes(".github"),
        workflows: wf,
        pagesEnabled: process.argv[3] === "true",
        environments: envs,
        rootEntries: tree
      }, null, 2));
    });
  ' "$tree" "$wf" "$pages" "$envs"
done <<< "$repos"
echo "]"
