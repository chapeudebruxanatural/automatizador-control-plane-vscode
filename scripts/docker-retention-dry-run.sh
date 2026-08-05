#!/usr/bin/env bash
# =============================================================================
# docker-retention-dry-run.sh — simula a politica de retencao proposta
# =============================================================================
# Decide, imagem a imagem, o que a politica proposta MANTERIA e o que REMOVERIA.
# Nunca remove. Nao existe flag `--apply` neste script, de proposito: a remocao
# real precisa de aprovacao humana e substituicao do cron, nao de uma flag.
#
# Uso: scripts/docker-retention-dry-run.sh [alias-ssh]
# =============================================================================
set -uo pipefail

HOST="${1:-nvvps}"
KEEP_PER_REPO="${KEEP_PER_REPO:-2}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-30}"

RUN() { ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" "$*"; }

echo "=========================================================="
echo " SIMULACAO DA POLITICA DE RETENCAO PROPOSTA"
echo " manter $KEEP_PER_REPO por repositorio | idade maxima $MAX_AGE_DAYS dias"
echo " NENHUMA IMAGEM SERA REMOVIDA"
echo "=========================================================="
echo

# Uso real vem de `docker system df -v`, e nao de `docker ps --format {{.Image}}`.
#
# Motivo, aprendido na primeira execucao deste script contra a VPS: `docker ps`
# reporta a referencia com que o container FOI CRIADO. Quando uma tag e movida
# ou removida depois, o container continua reportando `n8nio/n8n:latest`
# enquanto a imagem passou a figurar como `n8nio/n8n:<none>`. Comparar por
# referencia marcava como orfa uma imagem com tres containers em execucao — e o
# script recomendaria apagar o n8n inteiro.
#
# A coluna CONTAINERS de `docker system df -v` conta containers por IMAGE ID, o
# que nao depende de tag nenhuma.
IN_USE_IDS="$(RUN 'docker system df -v 2>/dev/null' \
  | awk '/^Images space usage:/{f=1;next} /^Containers space usage:/{f=0} f && NF>=7 && $3 ~ /^[0-9a-f]{12}$/ {print $3"|"$NF}' \
  | awk -F'|' '$2 ~ /^[0-9]+$/ && $2 > 0 {print $1}')"

IMAGES="$(RUN 'docker images --format "{{.Repository}}:{{.Tag}}|{{.ID}}|{{.CreatedAt}}|{{.Size}}"')"

printf '%s\n' "$IMAGES" | KEEP="$KEEP_PER_REPO" MAXAGE="$MAX_AGE_DAYS" IN_USE="$IN_USE_IDS" node -e '
const keepPerRepo = Number(process.env.KEEP || 2);
const maxAgeDays  = Number(process.env.MAXAGE || 30);
// Conjunto de IMAGE IDs com pelo menos um container. Ver comentario no shell.
const inUse = new Set((process.env.IN_USE || "").split("\n").map(s => s.trim()).filter(Boolean));
if (inUse.size === 0) {
  console.error("ABORTADO: nao foi possivel determinar quais imagens estao em uso.");
  console.error("Sem essa informacao o relatorio recomendaria remover imagens vivas.");
  process.exit(2);
}

let raw = "";
process.stdin.on("data", c => raw += c).on("end", () => {
  const images = raw.split("\n").filter(Boolean).map(line => {
    const [ref, id, createdAt, size] = line.split("|");
    const repo = (ref || "").split(":").slice(0, -1).join(":") || ref;
    const created = new Date((createdAt || "").replace(/ [A-Z]{3,4}$/, ""));
    const ageDays = Number.isNaN(created.getTime())
      ? null
      : Math.floor((Date.now() - created.getTime()) / 86400000);
    return { ref, id, repo, ageDays, size, dangling: /<none>/.test(ref) };
  });

  // Mais recente primeiro, dentro de cada repositorio.
  const byRepo = new Map();
  for (const img of images) {
    if (!byRepo.has(img.repo)) byRepo.set(img.repo, []);
    byRepo.get(img.repo).push(img);
  }
  for (const list of byRepo.values()) {
    list.sort((a, b) => (a.ageDays ?? 1e9) - (b.ageDays ?? 1e9));
  }

  const keep = [], remove = [];
  for (const [repo, list] of byRepo) {
    list.forEach((img, idx) => {
      if (inUse.has(img.id)) {
        keep.push({ ...img, why: "em uso por container" });
      } else if (!img.dangling && idx < keepPerRepo) {
        keep.push({ ...img, why: `entre as ${keepPerRepo} mais recentes de ${repo} (rollback)` });
      } else if (img.ageDays !== null && img.ageDays <= maxAgeDays && !img.dangling) {
        keep.push({ ...img, why: `mais nova que ${maxAgeDays} dias` });
      } else {
        remove.push({ ...img, why: img.dangling ? "sem tag e sem uso" : `sem uso ha mais de ${maxAgeDays} dias` });
      }
    });
  }

  const line = (i) => `  ${(i.ref || "").padEnd(46)} ${(i.size || "").padStart(8)}  ${String(i.ageDays ?? "?").padStart(4)}d  ${i.why}`;
  console.log(`MANTER (${keep.length}):`);
  keep.forEach(i => console.log(line(i)));
  console.log(`\nREMOVER (${remove.length}):`);
  remove.length ? remove.forEach(i => console.log(line(i))) : console.log("  nenhuma");

  const freed = remove.reduce((acc, i) => {
    const m = /^([\d.]+)([KMG]B)$/.exec((i.size || "").replace(/\s/g, ""));
    if (!m) return acc;
    const mult = { KB: 1 / 1024, MB: 1, GB: 1024 }[m[2]] || 0;
    return acc + Number(m[1]) * mult;
  }, 0);
  console.log(`\nespaco liberado estimado: ${freed.toFixed(0)} MB`);
  console.log("\nNENHUMA IMAGEM FOI REMOVIDA. Substituir o cron exige aprovacao de Nivel 2.");
});
'
