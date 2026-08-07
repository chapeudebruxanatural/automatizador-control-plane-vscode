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

## VPS — pendências do levantamento de backup (06/08)

Ver `docs/discovery/vps-inventory-2026-08-06.md` e `HANDOFF.md` §10.1 (R-001).

- [ ] **Mais urgente.** Localizar onde mora o conteúdo real do Encantaria. O
      site está no ar e o CRM mostra produtos confirmados pelo dono, mas o
      Postgres de `encantaria_database` só tem o schema do Directus vazio —
      restore testado e verificado em container descartável, sem tocar em
      produção. O conteúdo real está em algum lugar ainda não identificado.
      `verificationStatus: unknown`. Pode significar dado de cliente sem
      nenhum backup.
- [ ] Os 7 dumps de Postgres somam só 2,2 MB — pouco para Chatwoot, n8n,
      Typebot e NocoDB. Investigar se essas aplicações usam mesmo o container
      `postgres_postgres` ou guardam dado fora do alcance de
      `backup-postgres.sh`.
- [ ] Restore só foi exercitado no dump do `encantaria`. Os outros 6
      (`pgvector-chatwoot`, `pgvector-novacena_editais`,
      `postgres-shared-evolution`, `postgres-shared-n8n_queue`,
      `postgres-shared-nocodb`, `postgres-shared-typebot`) não foram testados.
- [ ] Backups (`volumes` + `postgres`) ainda moram só em
      `/var/backups/control-plane`, na própria VPS — falta subir para um
      destino externo. Reaproveitar o mecanismo do `novacena-backup.sh`, que
      já sobe para S3 com credencial fora do script.
- [ ] Firewall da VPS: `-P INPUT ACCEPT`, nenhuma regra em `INPUT`. Portas
      2377/7946/4789/3000 abertas sem filtro. Corrigir pelo firewall do
      painel da Hostinger — não instalar `ufw` (não se aplica bem a portas
      publicadas por container em host Docker).

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
