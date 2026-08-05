# AutomatizadorIA — Control Plane

Repositório privado central da operação AutomatizadorIA. Reúne, em um só lugar,
o que hoje está espalhado entre a VPS, o n8n, o GitHub, a Cloudflare e as contas
Google e Meta: **inventário do que existe, contexto de cada cliente, e a base de
código que vai automatizar a operação com segurança.**

> **Estado atual:** fundação. A aplicação sobe localmente, responde `/health` e
> `/ready`, e **não executa nenhuma ação externa**. Todos os adaptadores de
> integração são contratos com implementação simulada. O kill switch está ligado.

## Por que existe

A operação cresceu em ferramentas antes de crescer em coordenação. Há
repositórios sem dono declarado, containers rodando sem inventário, workflows de
n8n cuja função só está na cabeça de quem os criou, e duas contas Google que não
podem se misturar. O Control Plane resolve isso em duas camadas:

1. **Camada de conhecimento** (`brain/`, `clients/`, `inventory/`, `docs/`) —
   a verdade sobre o que existe, com procedência explícita de cada afirmação.
2. **Camada de execução** (`apps/`, `packages/`) — automação com kill switch,
   aprovação humana e trilha de auditoria.

A camada de conhecimento vem primeiro de propósito. Automatizar o que não se
conhece é como consertar fiação no escuro.

## Início rápido

Requisitos: Node.js 20+ (testado em v24.14.0) e npm. **Docker não é necessário
para desenvolver** — não há dependência de container local.

```bash
npm install
cp .env.example .env    # ajuste se precisar; os padrões já são seguros
npm run dev
```

Verificação:

```bash
curl -s http://localhost:3000/health
curl -s http://localhost:3000/ready
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe a API com recarga (`tsx watch`) |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Executa a build compilada |
| `npm run lint` | ESLint sobre todo o código |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Suíte de testes (node:test) |
| `npm run scan:secrets` | Varre arquivos em *stage* por padrões de segredo |
| `npm run scan:secrets:all` | Varre todos os arquivos rastreados |

## Estrutura

```
apps/api/          API HTTP mínima (health, ready, kill switch)
apps/worker/       Laço de reconciliação (hoje: no-op auditado)
packages/domain/   Entidades, ações e regras que não dependem de infraestrutura
packages/security/ Kill switch, política de aprovação, redação de dados
packages/audit/    Trilha de auditoria
packages/integrations/  Portas (interfaces) e adaptadores simulados
packages/shared/   Configuração validada, logger, utilitários
brain/             Conhecimento operacional da empresa
clients/           Um diretório por cliente, com perfil estruturado
inventory/         Inventários factuais em YAML
docs/              Arquitetura, descoberta, operação, segurança, runbooks, ADRs
scripts/           Utilitários de linha de comando
tests/             Testes
```

## Segurança em uma linha

Kill switch ligado, escrita bloqueada, segredo nunca versionado, VPS somente
leitura. Leia [SECURITY.md](SECURITY.md) antes de mexer em qualquer integração.

## Documentos de navegação

- [CLAUDE.md](CLAUDE.md) — contrato de trabalho para agentes e para quem chega agora
- [STATUS.md](STATUS.md) — o que está pronto, o que está bloqueado
- [TASKS.md](TASKS.md) — fila de trabalho
- [DECISIONS.md](DECISIONS.md) — registro cronológico de decisões
- [docs/architecture/overview.md](docs/architecture/overview.md) — desenho do sistema
