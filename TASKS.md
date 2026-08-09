# TASKS

Fila de trabalho do Control Plane. Ordenada por dependência, não por urgência.

Legenda: `[ ]` aberto · `[~]` em andamento · `[x]` concluído · `[!]` bloqueado

---

## Google Ads — estabilização atual da Garbo (08/08)

- [x] Identificar quem pausou 24016194642, 24016194645 e 24016194648: script
      horário `GARBO | TRAVA R$100 | 20260728` (`11999683`), sob
      `contato.automatizadoria@gmail.com`.
- [x] Com aprovação do dono, remover somente a frequência horária do script
      `11999683`; código preservado, status `Ativado`, frequência `Nenhuma`.
- [x] Depois de neutralizar a trava, reativar exatamente 24016194642,
      24016194645 e 24016194648, mantendo R$ 6/R$ 5/R$ 3 por dia.
- [x] Após 09:49, confirmar por leitura que os dois scripts estão sem
      frequência e não há regras automatizadas. As três campanhas pretendidas
      seguem ativas.
- [x] **Intenção reconciliada:** em 09/08 o dono confirmou que deseja manter
      exatamente as cinco ativas, incluindo MARCA `24016194651` e CASAMENTOS
      `24016194654`. Livro-caixa atualizado para R$ 34/dia; nenhuma campanha
      foi alterada pelo Control Plane. Governador confirmou zero divergências.
- [x] Relatórios: Garbo 0 em `WhatsApp | GARBO` desde o crédito de 07/08 até
      08/08 09:04. Cássio atualizado ao vivo em 09/08: 20
      `WHATSAPP - CÁSSIO`, R$ 368,97 nas Demand Gen e R$ 18,45 por WhatsApp;
      cidades por local de presença: São Paulo 9, Brasília 3, Goiânia 3, Rio 3,
      Curitiba 1 e Salvador 1. Texto em
      `reports/cassio-ferraz/relatorio-whatsapp-2026-08-09.md`.
- [ ] Só depois de 24h contínuas realmente no ar, avaliar gasto, cliques e
      conversas da Garbo. O zero de 07/08 foi causado pela pausa.
- [!] Buteco `24105770570`: a mídia nova também foi rejeitada por direito
      autoral. O dono fará a reivindicação; campanha permanece congelada.

---

## Concluído nesta fase

- [x] Proteção inicial: `.gitignore`, `.env.example`, `SECURITY.md`, política de segredos
- [x] Scanner de segredos com testes de detecção e de falso positivo
- [x] Repositório privado central no GitHub, com `main` publicada
- [x] Estrutura de diretórios e documentos-raiz
- [x] Catálogo inicial de clientes com procedência explícita
- [x] Inventário de repositórios via `gh` CLI (metadados)
- [x] Inventário somente-leitura da VPS
- [x] API do n8n integrada somente em leitura: chave temporária fora do Git,
      cliente GET-only, 33 workflows (1 ativo, 32 inativos, 3 arquivados)
- [x] Token Cloudflare somente leitura, restrito à conta e com expiração;
      valor fora do Git em arquivo 600
- [x] Inventário Cloudflare reproduzível: 8 zonas, 14 DNS, 10 Pages, 3 Workers,
      6 domínios de Worker e 0 túneis
- [x] Memória isolada por cliente e comando `npm run perguntar:cliente`
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

- [x] **Fase 0 — destravar.** API do Google Ads em v22; chave de serviço e
      developer token por caminhos protegidos locais; leitura ao vivo provada.
- [x] **Fase 1 — tornar contínuo.** Workflow agendado e secrets verificados no
      GitHub Actions; execuções `Scheduled` já provadas.
- [x] Núcleo de segurança do agente: resolvedor de cliente, confirmação por
      código, catálogo de capacidades — 52 testes
- [ ] **Fase 2 — integrar o banco existente.** O dono confirma que a
      infraestrutura já existe; falta verificar esquema e projetar clientes,
      contas e histórico. O YAML segue como fonte revisável
- [ ] Capturar payload real da Evolution (`REAL_PAYLOAD_VERIFIED = false`)
- [ ] **Fase 3 — WhatsApp somente leitura.** Relatório e status. Nenhuma escrita
- [ ] Interpretador de intenção: texto livre → ação declarada + parâmetros
- [ ] Alerta do monitor **chegar** ao dono (hoje só imprime no log do Actions)
- [ ] Decidir a frase de pânico que desliga tudo, e onde é processada
- [ ] **Fase 4 — escrita com confirmação.** Só depois da 3 sólida
- [ ] **Fase 5 — integrar o painel web existente.** Configuração, histórico e
      aprovação do que for caro demais para o celular
- [ ] **Fase 6 — adaptadores.** GitHub, deploy e SaaS já existem; falta expor
      ações tipadas e seguras pelo control plane

---

## Próximo bloco — consolidar conhecimento

- [ ] Revisar `clients/index.yaml` com o dono e promover entradas de
      `owner_reported` para `verified`
- [ ] Resolver os repositórios sem cliente associado (`inventory/repositories.yaml`,
      campo `relationshipStatus: unknown`)
- [x] Mapear domínios reais e cruzar com zonas da Cloudflare →
      `inventory/domains.yaml`; API somente leitura e coleta reproduzível.
- [~] Contar e classificar workflows do n8n — nomes/status dos 30 concluídos
      pela interface (1 ativo). Classificar nós, efeitos e cliente segue
      bloqueado porque a API key do plano atual não permite escopo somente
      leitura. Aguardar chave ampla temporária ou usuário SQL read-only.
- [ ] Documentar, por cliente, qual workflow do n8n atende qual processo

## Próximo bloco — integrações somente-leitura

- [x] `GitHubReadAdapter` real sobre o `gh` CLI: owner fixo, 14 repositórios
      lidos ao vivo, sem superfície de escrita ou inferência de cliente.
- [x] `VpsReadAdapter` real: somente host, `docker ps` e `docker stack ls`,
      comandos fixos e sem entrada arbitrária. Ao vivo: 32/32 running, 13 stacks.
- [x] `CloudflareReadClient`, adaptador e coletor prontos/testados; ações
      `cloudflare.zones.list` e `cloudflare.dns.list` registradas, e `/status`
      recebe o estado real do adaptador. Nenhum método de escrita existe.
- [!] `N8nAdapter` leitura — **bloqueado**: exige API key
- [ ] `GoogleAdapter` leitura na conta canônica — exige OAuth
- [-] `MetaAdapter` leitura — adiado pelo dono em 09/08. Sessão autenticada e
      19 portfólios listados, mas biometria interna não concluída. Não bloquear
      o restante do lançamento e não reutilizar o inventário antigo.

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
