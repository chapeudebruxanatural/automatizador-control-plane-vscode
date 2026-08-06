# TASKS

Fila de trabalho do Control Plane. Ordenada por dependência, não por urgência.

Legenda: `[ ]` aberto · `[~]` em andamento · `[x]` concluído · `[!]` bloqueado

---

## Concluído nesta fase

- [x] Proteção inicial: `.gitignore`, `.env.example`, `SECURITY.md`, política de segredos
- [x] Scanner de segredos com testes de detecção e de falso positivo
- [x] Repositório privado central no GitHub, com `main` publicada
- [x] Estrutura de diretórios e documentos-raiz
- [x] Catálogo inicial de clientes com procedência explícita
- [x] Inventário de repositórios via `gh` CLI (metadados)
- [x] Inventário somente-leitura da VPS
- [x] Inventário parcial do n8n (sem credenciais)
- [x] Matriz de contas e acessos, com separação das duas contas Google
- [x] Aplicação mínima: `/health`, `/ready`, `/status`, kill switch, auditoria
- [x] Contratos dos adaptadores de integração
- [x] Testes de segurança e de saúde

---

## Plataforma de agente — fases

Desenho completo em [docs/architecture/agent-platform.md](docs/architecture/agent-platform.md).
Ordenadas por dependência. **Não pule a fase 3.**

- [x] **Fase 0 — destravar.** API do Google Ads em v22; credencial por
      `GOOGLE_ADS_KEY_PATH` para rodar fora do notebook do dono
- [~] **Fase 1 — tornar contínuo.** Workflow escrito e testado com `HOME` vazio.
      **Bloqueado no dono:** cadastrar dois secrets —
      ver [docs/runbooks/ativar-monitor.md](docs/runbooks/ativar-monitor.md)
- [x] Núcleo de segurança do agente: resolvedor de cliente, confirmação por
      código, catálogo de capacidades — 52 testes
- [ ] **Fase 2 — banco na VPS.** Postgres com clientes, contas, histórico. O
      YAML segue como fonte revisável; o banco é projeção, não o contrário
- [ ] Capturar payload real da Evolution (`REAL_PAYLOAD_VERIFIED = false`)
- [ ] **Fase 3 — WhatsApp somente leitura.** Relatório e status. Nenhuma escrita
- [ ] Interpretador de intenção: texto livre → ação declarada + parâmetros
- [ ] Alerta do monitor **chegar** ao dono (hoje só imprime no log do Actions)
- [ ] Decidir a frase de pânico que desliga tudo, e onde é processada
- [ ] **Fase 4 — escrita com confirmação.** Só depois da 3 sólida
- [ ] **Fase 5 — página web.** Configuração, histórico, aprovação do que for
      caro demais para o celular
- [ ] **Fase 6 — executores.** GitHub, deploy, SaaS dos clientes

---

## Próximo bloco — consolidar conhecimento

- [ ] Revisar `clients/index.yaml` com o dono e promover entradas de
      `owner_reported` para `verified`
- [ ] Resolver os repositórios sem cliente associado (`inventory/repositories.yaml`,
      campo `relationshipStatus: unknown`)
- [ ] Mapear domínios reais e cruzar com zonas da Cloudflare → `inventory/domains.yaml`
- [!] Contar e classificar workflows do n8n — **bloqueado**: exige API key
- [ ] Documentar, por cliente, qual workflow do n8n atende qual processo

## Próximo bloco — integrações somente-leitura

- [ ] `GitHubAdapter` real em modo leitura, sobre o `gh` CLI já autenticado
- [ ] `VpsAdapter` real em modo leitura, com lista branca de comandos
- [ ] `CloudflareAdapter` leitura (zonas, DNS, túneis) — exige token somente-leitura
- [!] `N8nAdapter` leitura — **bloqueado**: exige API key
- [ ] `GoogleAdapter` leitura na conta canônica — exige OAuth
- [ ] `MetaAdapter` leitura nas 2 contas ativas

Cada adaptador entra com testes de contrato e permanece atrás do kill switch.

## Próximo bloco — operação segura

- [ ] Persistir auditoria em arquivo com rotação
- [ ] Fluxo de aprovação com token de uso único e expiração
- [ ] Runbook: o que fazer quando um serviço da VPS cai
- [ ] Runbook: rotação de credenciais
- [ ] Hook de pre-commit chamando `scan:secrets` automaticamente
- [ ] CI no GitHub Actions rodando lint, typecheck, teste, build e scan

## Fora de escopo por ora

- WhatsApp (envio ou recebimento) — só depois que auditoria e aprovação
  estiverem maduras. Erro aqui fala com cliente real.
- Qualquer escrita em produção.
- Docker local.
