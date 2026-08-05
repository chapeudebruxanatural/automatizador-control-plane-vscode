# Revisão de segurança — Ciclo 2

Data: 2026-08-05 · Branch: `feat/operational-stabilization-v1`

Revisão dos arquivos críticos antes de considerar o Ciclo 2 pronto. Cada
afirmação abaixo foi verificada com comando, não por leitura casual.

---

## Resultado por controle

| Controle | Estado | Como foi verificado |
|---|---|---|
| `writeActionsEnabled` permanece `false` | ✅ | `WRITE_ACTIONS_ENABLED = false as const` e tipo literal `false` em `adapter.ts` e `index.ts` — não é configurável por ambiente |
| Nenhum shell livre | ✅ | `grep` por `child_process`, `execSync`, `spawnSync`, `eval(`, `new Function` em `packages/` e `apps/` → nenhuma ocorrência |
| Nenhuma interpolação de comando | ✅ | O `command-handler` é um `switch` fechado; não há string montada e executada |
| Nenhum segredo literal | ✅ | `npm run scan:secrets:all` → 148 arquivos, 0 achados |
| Nenhum endpoint de escrita oculto | ✅ | A API tem 4 rotas: `GET /health`, `GET /ready`, `GET /status`, `POST /whatsapp/webhook`. Todo outro método → 405 |
| Kill switch ativo por padrão | ✅ | `parseSafetyFlag` só desliga com o literal `"false"`; qualquer outro valor mantém ligado |
| Logs mascarados | ✅ | Todas as chamadas de log em `evolution/index.ts` usam `maskedFrom`; `message.from` só é usado como chave em memória (allowlist, rate limit) |
| Nenhum serviço externo alterado | ✅ | Ver seção "Superfície externa" |

---

## Achados desta revisão

Três problemas reais foram encontrados e corrigidos durante o ciclo. Nenhum
era teórico.

### 1. Scripts de backup nunca commitados (`fix: reconcile backup...`)

A regra `backup/` no `.gitignore` capturava `scripts/backup/` e
`docs/runbooks/backup/` por coincidência de nome. `git add -A` os ignorava em
silêncio. **Severidade: alta** — o PR descrevia como entregue algo que não
existia no repositório.

Corrigido com negação explícita, validada com `git check-ignore` nos dois
sentidos (destravou o código, manteve bloqueado o dado real de backup).

### 2. Ausência de prevenção de loop no WhatsApp (`test: harden Evolution...`)

Não havia checagem de `fromMe`. A Evolution reenvia as mensagens que o próprio
número conectado envia — um bot que responde entraria em loop infinito no
instante em que o envio fosse habilitado. **Severidade: alta**, mesmo com
escrita desligada, porque o defeito só se manifestaria depois de ligada.

Corrigido em `normalize.ts`, com `fromMe` como primeiro portão.

### 3. `413` que nunca chegava ao cliente (`test: harden Evolution...`)

Ao exceder 64 KB, a rota chamava `req.destroy()` antes de a resposta sair — o
cliente via erro de socket sem saber a causa. **Severidade: baixa** (nega
serviço corretamente, apenas sem explicar), mas mascarava diagnóstico.

---

## Superfície externa

Nenhuma alteração em sistema externo nesta branch. Verificado:

| Sistema | Acesso usado | Escrita |
|---|---|---|
| VPS (`nvvps`) | leitura via guarda que recusa comando mutante | nenhuma |
| GitHub | `gh` CLI leitura + push nesta branch | apenas este repositório |
| Cloudflare | nenhum (sem credencial) | nenhuma |
| n8n | nenhum (sem credencial) | nenhuma |
| Google Ads | nenhum (sem credencial) | nenhuma |
| WhatsApp / Evolution | leitura de metadados de container | nenhuma |

O CI (`.github/workflows/ci.yml`) roda com `permissions: contents: read`,
`persist-credentials: false`, sem nenhum secret referenciado — não alcança
nenhum destes sistemas mesmo que alguém tentasse.

---

## Ações mutantes: inalcançáveis pelo WhatsApp

O registry tem 3 ações mutantes: `vps.container.restart`,
`meta.campaign.pause`, `whatsapp.message.send`.

Os comandos do WhatsApp invocam apenas 4 ações, **todas com
`mutating: false`**: `system.health.check`, `vps.containers.list`,
`n8n.workflows.list`, `github.repositories.list`.

Isso está travado por teste de regressão
(`tests/whatsapp/evolution.test.ts` → *"nenhum comando do WhatsApp alcança
uma ação MUTANTE do registry"*), que percorre todos os comandos permitidos e
falha se algum invocar ação mutante. A diferença entre "hoje não alcança" e
"não pode passar a alcançar sem alguém perceber".

---

## Scripts: comandos destrutivos auditados

Todo `rm` nos scripts opera **apenas em artefato criado pelo próprio script**:

- `backup-*.sh`: `rm -f "$artifact"` remove o próprio arquivo recém-criado
  quando o dump falha
- `lib.sh` `prune_old`: usa `run rm -f`, que respeita `dry-run` e **nunca
  apaga o artefato mais recente**
- `restore-postgres.sh`: `docker rm -f "$TMP_NAME"` remove só o container
  temporário de nome único que ele mesmo subiu

Os scripts de retenção (`docker-retention-report.sh`,
`docker-retention-dry-run.sh`) **não têm flag `--apply`** — a ausência é
deliberada e documentada no cabeçalho.

## Sudoers

`visudo -cf` → `parsed OK`. Nenhum comando mutante concedido — verificado por
`grep` contra `rm|stop|restart|prune|start|enable|disable|install|reboot|shutdown|exec|inspect`
na lista de permissões, sem correspondência.

---

## Limitações que permanecem

1. **`REAL_PAYLOAD_VERIFIED = false`** — o formato do webhook veio da
   documentação, não de amostra da instância real.
2. **`x-webhook-signature` é convenção deste projeto**, não recurso da
   Evolution API. Resolver antes de conectar número real.
3. **Backup nunca restaurado de verdade** — testado só com dados sintéticos.
4. **API sem autenticação**, protegida apenas por escutar em `127.0.0.1`.
   Suficiente enquanto expõe só saúde e postura; obrigatória antes de expor
   qualquer ação.
