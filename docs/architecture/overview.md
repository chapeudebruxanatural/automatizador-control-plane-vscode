# Arquitetura — visão geral

Estado: **fundação**. O que está descrito abaixo existe em código; o que ainda
não existe está marcado como planejado.

---

## O problema que a arquitetura resolve

O Control Plane precisa agir sobre sistemas heterogêneos (GitHub, VPS via SSH,
n8n, Cloudflare, Google, Meta, WhatsApp) e ao mesmo tempo garantir três coisas
que normalmente competem entre si:

1. **Segurança** — nenhuma ação de escrita escapa do freio.
2. **Rastreabilidade** — toda tentativa, bem ou mal sucedida, deixa registro.
3. **Substituibilidade** — trocar ou simular uma integração não pode exigir
   mudar as regras de negócio.

A resposta é uma arquitetura de portas e adaptadores, com um ponto único de
decisão no meio.

---

## Camadas

```
                 ┌──────────────────────────────┐
   HTTP  ───────▶│   apps/api    apps/worker    │   entrada
                 └──────────────┬───────────────┘
                                │
                 ┌──────────────▼───────────────┐
                 │      packages/domain         │   o que pode acontecer
                 │  Action · Client · Result    │   (sem I/O)
                 └──────────────┬───────────────┘
                                │
                 ┌──────────────▼───────────────┐
                 │     packages/security        │   pode acontecer agora?
                 │  KillSwitch · ApprovalPolicy │
                 └──────────────┬───────────────┘
                                │
                 ┌──────────────▼───────────────┐
                 │      packages/audit          │   registra a decisão
                 └──────────────┬───────────────┘
                                │
                 ┌──────────────▼───────────────┐
                 │   packages/integrations      │   executa (portas)
                 │  GitHub · Vps · N8n · ...    │
                 └──────────────────────────────┘
```

`packages/shared` (configuração validada, logger com redação, utilitários)
atravessa todas as camadas.

**A ordem importa.** Segurança vem antes de auditoria, que vem antes de execução.
Uma ação recusada é auditada exatamente como uma ação executada — a diferença
está no resultado, não na existência do registro. Isso é o que permite detectar
uma automação tentando escrever antes da hora.

---

## O caminho de uma ação

Toda operação com efeito colateral é modelada como uma `Action`:

```ts
interface Action {
  kind: string;           // 'vps.container.restart'
  mutating: boolean;      // true => passa pelo freio
  clientSlug?: string;    // a quem pertence o recurso
  target: string;         // o recurso concreto
  payload: unknown;       // validado por esquema
}
```

O executor (`packages/domain/src/executor.ts`) segue sempre a mesma sequência:

1. **Valida** o payload contra o esquema registrado para aquele `kind`.
   Sem esquema registrado, a ação é recusada — não existe ação anônima.
2. **Consulta o kill switch.** Se ligado e a ação é mutante: recusa com
   `blocked_by_kill_switch`.
3. **Consulta a política de aprovação.** Se exigida e ausente: recusa com
   `approval_required`.
4. **Executa** pelo adaptador correspondente.
5. **Audita** o desfecho, qualquer que seja ele.

Os passos 2 e 3 vivem no domínio, não nos adaptadores. Se estivessem nos
adaptadores, cada nova integração precisaria lembrar de implementá-los — e uma
delas esqueceria. Colocando no caminho central, esquecer deixa de ser possível.

---

## Portas de integração

Cada sistema externo é uma interface em `packages/integrations/src/ports/`, com
uma implementação simulada em `src/adapters/mock/`. Nesta fase **só existem as
simuladas** — nenhuma chamada real sai da máquina.

| Porta | Sistema | Estado |
|---|---|---|
| `GitHubAdapter` | GitHub via `gh` CLI | contrato + mock |
| `VpsAdapter` | VPS por SSH, lista branca de comandos | contrato + mock |
| `N8nAdapter` | n8n REST API | contrato + mock |
| `CloudflareAdapter` | Cloudflare API | contrato + mock |
| `GoogleAdapter` | Gmail, Drive, Calendar | contrato + mock |
| `MetaAdapter` | Meta Marketing API | contrato + mock |
| `WhatsAppAdapter` | WhatsApp Cloud API | contrato + mock, **desligado** |

Portas transversais:

| Porta | Responsabilidade |
|---|---|
| `SecretProvider` | Entrega segredo por nome, sem que ele passe por arquivo versionado |
| `ApprovalProvider` | Decide se uma ação tem aprovação humana válida |
| `AuditProvider` | Persiste a trilha de auditoria |

O `GoogleAdapter` recebe a conta como parâmetro obrigatório, e a implementação
real deverá recusar operar entre contas diferentes numa mesma ação. A separação
entre `contato.automatizadoria@gmail.com` e `estudionovacena@gmail.com` é regra
de negócio, não convenção de uso.

---

## Decisões que moldaram este desenho

- **Sem framework HTTP.** A API usa o módulo `http` nativo. Menos dependência de
  terceiros no caminho que segura credenciais de produção.
- **Sem Docker local** — [ADR 0001](../adr/0001-sem-docker-local.md).
- **Kill switch por padrão** — [ADR 0002](../adr/0002-kill-switch-por-padrao.md).
- **Procedência explícita no inventário** — [ADR 0003](../adr/0003-procedencia-do-inventario.md).
- **Auditoria em memória por ora**, atrás de `AuditProvider`. Trocar por arquivo
  com rotação ou por banco é mudança de adaptador, não de domínio.

---

## Endpoints

| Rota | Uso | Resposta |
|---|---|---|
| `GET /health` | Liveness. O processo está vivo? | `200` sempre que o processo responde |
| `GET /ready` | Readiness. Está apto a receber tráfego? | `200` pronto, `503` não pronto |
| `GET /status` | Postura operacional | kill switch, modo, integrações habilitadas |

`/status` nunca expõe valores de configuração sensíveis — apenas se estão
presentes ou ausentes.

---

## O que ainda não existe

- Persistência real (banco, fila).
- Adaptadores reais para qualquer integração.
- Autenticação na própria API — hoje ela só escuta em `localhost`.
- Fluxo de aprovação com token de uso único e expiração.
- CI executando lint, typecheck, teste, build e varredura de segredos.

A fila de trabalho está em [TASKS.md](../../TASKS.md).
