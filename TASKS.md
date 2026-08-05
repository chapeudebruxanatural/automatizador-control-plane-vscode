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
