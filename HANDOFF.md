# HANDOFF — AutomatizadorIA Control Plane

Documento de transferência. Data: **2026-08-05**.
Cole este arquivo inteiro como contexto inicial no Codex.

---

## 1. O QUE É

Repositório privado central da operação AutomatizadorIA. Reúne inventário de
infraestrutura, contexto de clientes e automação com trava de segurança.

**Repo:** `dadocruz/automatizador-control-plane` (privado)
**Diretório local:** `/Users/dadocruz/Projetos/automatizador-control-plane`

| Ref | SHA | Estado |
|---|---|---|
| `main` | `d91a670` | Ciclo 1 + 2 mesclados |
| `feat/operational-stabilization-v1` | `0665ae1` | **mesclada** (PR #1) |
| `feat/google-ads-live-operations-v1` | `cea21a6` | **ativa, PR #2 draft, NÃO mesclada** |

**Continue em `feat/google-ads-live-operations-v1`.**

### Comandos

```bash
npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run scan:secrets:all
```

**166 testes.** CI no GitHub Actions roda em Node 20.11.0 e 24.

---

## 2. REGRAS QUE NÃO PODEM SER QUEBRADAS

1. **Segredo nunca entra em arquivo versionado.** `npm run scan:secrets` antes
   de commitar. O scanner reporta arquivo/linha/tipo, nunca o valor.
2. **VPS é somente leitura.** `scripts/collect-vps-inventory.sh` recusa comando
   mutante em código, não só por disciplina.
3. **Contas Google separadas.** `contato.automatizadoria@gmail.com` (canônica)
   e `estudionovacena@gmail.com` (Novacena) não se misturam.
4. **Conta de anúncios é compartilhada** entre Cássio, Garbo, NovaCena e
   Gaveta. Isolamento é por campanha — ver `scope.ts`. Nunca usar "todas as
   conversões da conta" como resultado de um cliente.
5. **WhatsApp: clique ≠ lead ≠ contrato.** `WHATSAPP - CÁSSIO` é
   microconversão. `CASSIO | LEAD QUALIFICADO | FORM` é lead.
6. **Nunca `force push`. Nunca apagar recurso.**

---

## 3. GOOGLE ADS — ESTÁ CONECTADO E FUNCIONANDO

| Item | Valor |
|---|---|
| MCC / login-customer-id | `3992594849` |
| Conta anunciante | `2656966896` |
| Autenticação | conta de serviço (**sem** delegação de domínio) |
| Chave | `~/Documents/Codex/.secrets/google-ads/service-account.json` (modo 600) |
| Developer token | `.env` → `GOOGLE_ADS_DEVELOPER_TOKEN` (modo 600, fora do Git) |
| API | **v21** |
| Nível de acesso | Básico |

A conta de serviço **já está vinculada como usuária** da conta do Ads — foi por
isso que funcionou sem Workspace.

### Módulo (`packages/integrations/src/google-ads/`)

| Arquivo | Função |
|---|---|
| `credential-provider.ts` | Lê a chave **por caminho**, nunca por valor. Falha fechada. |
| `transport.ts` | JWT com `node:crypto` → access token → REST. Sem SDK. `sanitize()` limpa segredo de qualquer erro. |
| `scope.ts` | Allowlist de conta e campanha. Impede ler campanha de um cliente declarando outro. |
| `read-adapter.ts` | 10 operações de leitura. `assertReadOnlyQuery` recusa GAQL sem `SELECT`. |
| `write-adapter.ts` | `validateOnly` → plano → hash → aprovação → execução. |

### Fluxo de escrita

```
planCampaignStatus() / planCampaignBudget()
  → valida com validateOnly: true (Google confirma sem executar)
  → devolve MutationPlan com hash SHA-256 do payload
  → execute(plan, hash) só roda se o hash bater
```

O hash é recalculado na execução: plano alterado depois de aprovado **não roda**.

### Descobertas técnicas da API (custaram tentativa e erro)

- O orçamento da campanha do Cássio é **`CUSTOM_PERIOD`** (total do período),
  não diário. Gravar `amount_micros` devolve `INVALID_ARGUMENT` — o campo é
  **`total_amount_micros`**.
- O **tipo de orçamento é imutável** (`requestError.IMMUTABLE_FIELD`). Não dá
  para converter total → diário; só criar um orçamento novo.
- **Estender a data antes de subir o orçamento falha** com
  `BUDGET_BELOW_PER_DAY_MINIMUM`. A ordem importa: orçamento primeiro.
- `listAccessibleCustomers` devolve **só a MCC**. A conta filha se acessa via
  `login-customer-id`.

---

## 4. O QUE FOI EXECUTADO NO GOOGLE ADS (05/08/2026)

Campanha do Cássio `24066140634`, autorizado pelo dono:

| Operação | De → Para | Request ID |
|---|---|---|
| Orçamento total | R$ 203,20 → **R$ 472,94** | `DxGYRwSfTPNL-a6e1duZ9w` |
| Data final | 08/08 → **20/08** | `N7aI1EH774GQZDYEoVr-Ng` |
| Status | PAUSED → **ENABLED** | `ajgCun7HloI0XhndrUpo5g` |
| `WHATSAPP - CÁSSIO` `primary_for_goal` | false → **true** | `xMbYjE0H2R9w7f6h9evw8A` |

Estado pós-operação: **`ENABLED` / `ELIGIBLE`**, sem bloqueio.

Auditoria em `audit/google-ads.jsonl` (fora do Git).

---

## 5. DIAGNÓSTICO DO CÁSSIO — LEIA ANTES DE MEXER

### O achado que inverteu a conclusão

`metrics.conversions` = **0**, `metrics.all_conversions` = **5**.

Não se contradizem: `conversions` conta **só ações primárias**, e
`WHATSAPP - CÁSSIO` era não primária. **As 5 conversões sempre existiram.** O
"0 conversões" era artefato de configuração.

### Por dia (30 dias)

| Data | Custo | Cliques | CPC | WhatsApp |
|---|---|---|---|---|
| 28/07 | R$ 74,91 | 23 | R$ 3,26 | 0 |
| **29/07** | R$ 72,84 | **554** | **R$ 0,13** | **5** |
| 01–04/08 | R$ 25,00 | 65 | — | 0 |

100% do resultado veio de **mobile**.

### As três hipóteses

- **A — mensuração quebrada: REFUTADA.** A tag funciona.
- **B — problema pós-clique: PARCIAL.** Taxa de 0,9% (5/554). Baixa, mas existe.
- **C — reabertura degradou a entrega: CONFIRMADA, causa principal.**
  Com 0,9%, os 65 cliques pós-reabertura deveriam dar ~0,6 conversões. **Zero
  não é anomalia — é volume insuficiente.** A entrega caiu ~97%.

### Ponto que ainda não foi resolvido

A estratégia é **Maximizar cliques** (`TARGET_SPEND`): otimiza para clique
barato, **não** para contato no WhatsApp. Os 5 contatos foram incidentais.

Tornar a conversão primária melhorou a **medição**, não o leilão.

**Não trocar para lance por conversão agora** — precisa de ~30 conversões/mês
para calibrar, e há 5. O caminho é acumular volume com clique barato primeiro.

### Limiar de alerta definido

**Se chegarem ~300 cliques sem nenhum contato novo, tem algo quebrado depois do
clique** (botão do WhatsApp, landing ou tag). A 0,9%, 300 cliques deveriam dar
~3 contatos.

### Restrição financeira

**Conflito aberto:** orçamento configurado vs verba recebida. Não presumir
valor autorizado. Bloqueia aumento de orçamento, reativação e nova campanha.

---

## 6. GAVETA / BUTECO SERTANEJO — NÃO MEXER

Campanha `24105770570` — `DG | Buteco Sertanejo | Shorts | Spotify`

- `ENABLED` mas **`NOT_ELIGIBLE`**
- Ad `819900433355` → **`DISAPPROVED`**, política **`COPYRIGHTED_CONTENT`**,
  severidade **`FULLY_LIMITED`** (bloqueio total)
- Entrega: **0 / 0 / R$ 0,00**

**Não é falha de segmentação nem de orçamento.** A campanha nunca teve
oportunidade de veicular.

**Instrução vigente do dono: não mexer.** Não contestar, não editar, não
substituir vídeo.

Antes de contestar é preciso ter: autorização do fonograma, da obra, do vídeo,
licença **para mídia paga**, e procuração de agência. **A conta é compartilhada** —
reprovação repetida por direitos autorais afeta Cássio, Garbo e NovaCena junto.

Campanha antiga `24079586567` = `removed_by_owner`. Não reativar.

---

## 7. MONITORAMENTO

```bash
node --import tsx scripts/google-ads-monitor.mts
```

Somente leitura. Alerta em: CPC > R$ 1,00 · gasto acumulado > R$ 400 · mais de
R$ 100 num dia sem contato novo. Grava em `audit/google-ads-monitor.jsonl`.

**Estava agendado a cada 12h numa sessão do Claude — isso morre ao fechar.**
Para tornar permanente: `launchd` no Mac ou cron na VPS.

---

## 8. RESTO DA OPERAÇÃO (Ciclo 1 e 2)

### VPS `nvvps` — Debian 11, Docker Swarm, 13 stacks, 28 serviços

Riscos abertos, **nenhum corrigido**:

| ID | Sev | Risco |
|---|---|---|
| V-001 | crítico | Debian 11 no fim do suporte LTS; 193 dias sem reboot |
| R-001 | crítico | Backup cobre 1 de 13 stacks |
| R-002 | crítico | Backup provavelmente arquiva a cópia errada (checkout do Git, não os volumes) |
| R-003 | alto | Portas 2377/7946 do Swarm expostas em todas as interfaces |
| R-004 | alto | Arquivo com nome de backup de ambiente em `/root` (não aberto) |

Existe backup diário em S3 (`novacena-backup.timer`), mas só do NovaCena Motion.

Scripts prontos e testados, **não instalados**: `scripts/backup/`,
`scripts/restore/`, `scripts/docker-retention-*.sh`.

### WhatsApp / Evolution API — homologação

`packages/integrations/src/evolution/` · `writeActionsEnabled = false` fixo em
código · número real **não conectado**.

Defesas: HMAC em tempo constante, allowlist, rate limit, deduplicação, e
descarte de `fromMe` (**prevenção de loop** — a Evolution reenvia as próprias
mensagens).

**`REAL_PAYLOAD_VERIFIED = false`** — formato veio da documentação, não de
amostra real. `x-webhook-signature` é **convenção deste projeto**, não recurso
da Evolution.

### Bloqueios pendentes

- **n8n** — sem API key. Maior ponto cego: 13 stacks e ninguém sabe o que os
  workflows fazem.
- **Cloudflare** — sem token. Falta o mapa domínio → cliente.
- **Conector do Drive** — conta indeterminada, viola a separação Google.

### Segurança pendente

1. **TOTP de `contato.automatizadoria@gmail.com`** exposto em captura —
   registrado em `clients/vivere/security.yaml`, **não rotacionado**.
2. `~/Downloads/credentials.json` — chave S3 com permissão `644`.

---

## 9. ONDE ESTÁ CADA COISA

```
clients/<slug>/profile.yaml          contexto do cliente
clients/<slug>/google-ads.yaml       histórico + snapshot ao vivo
inventory/*.yaml                     fatos com procedência
docs/discovery/                      levantamentos datados
docs/operations/                     planos e políticas
docs/runbooks/                       procedimentos
brain/                               julgamento e critério
```

**Todo dado carrega `verificationStatus` e `lastVerifiedAt`.** Valores:
`live_api`, `historical_manual`, `user_reported`, `owner_reported`,
`discovered`, `verified`, `conflicting`, `stale`, `unknown`,
`requires_verification`.

**Regra:** inferência **nunca** vira `verified`. Já houve um caso concreto —
`encantaria_artesanal` foi classificado como commit acidental pela leitura só
do GitHub, e tinha stack em produção há 6 semanas.

Leituras essenciais: `CLAUDE.md`, `STATUS.md`, `DECISIONS.md`,
`docs/operations/cassio-campaign-recovery-plan.md`,
`docs/operations/gaveta-buteco-copyright-status.md`.

---

## 10. PRÓXIMOS PASSOS

**Imediato (24–48h):** acompanhar o CPC do Cássio. Se ~300 cliques vierem sem
contato, investigar landing e botão do WhatsApp.

**Curto prazo:** tornar o monitor permanente · resolver R-002 (confirmar as
montagens do `novacena-motion`) · rotacionar o TOTP · gerar API key do n8n e
token da Cloudflare.

**Não fazer agora:** trocar a estratégia de lance do Cássio (dados
insuficientes) · mexer no Buteco (instrução do dono) · conectar WhatsApp real ·
mesclar o PR #2 sem revisão.
