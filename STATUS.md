# STATUS

Última atualização: **2026-08-04**

## Onde estamos

Fundação estabelecida. O repositório existe, é privado, tem proteção de segredos
funcionando, inventários iniciais e uma aplicação TypeScript que roda localmente
sem Docker. **Nenhuma integração externa executa ação.**

## Componentes

| Componente | Estado | Observação |
|---|---|---|
| Repositório central | ✅ pronto | `dadocruz/automatizador-control-plane`, privado |
| Proteção de segredos | ✅ pronto | `.gitignore` + `scripts/scan-secrets.sh` validados |
| Documentos-raiz | ✅ pronto | CLAUDE, README, SECURITY, STATUS, TASKS, DECISIONS |
| Camada de conhecimento (`brain/`) | ✅ inicial | Precisa de refinamento com o dono |
| Catálogo de clientes | 🟡 parcial | 8 clientes registrados, maioria `owner_reported` |
| Inventário de repositórios | ✅ pronto | 13 repositórios, metadados verificados via `gh` |
| Inventário da VPS | ✅ pronto | Coleta somente leitura, sanitizada |
| Inventário do n8n | 🟡 parcial | Metadados de container obtidos; API exige chave |
| Matriz de acessos | ✅ pronto | Separação AutomatizadorIA / Novacena registrada |
| API mínima | ✅ pronto | `/health`, `/ready`, `/status` |
| Adaptadores de integração | 🟡 contratos | Interfaces + implementações simuladas |
| Auditoria | ✅ inicial | Sink em memória e em arquivo (não versionado) |
| Kill switch | ✅ ativo | Ligado por padrão, testado |
| WhatsApp | ⛔ desligado | Fora de escopo por decisão desta fase |

## Postura de segurança

- Kill switch: **ligado** (`CONTROL_PLANE_KILL_SWITCH=true`)
- Modo de execução: **dry-run**
- Aprovação humana: **exigida**
- VPS: **somente leitura**, nenhuma alteração feita
- Segredos versionados: **nenhum** (varredura limpa)

## Bloqueios ativos

| Bloqueio | Impacto | O que destrava |
|---|---|---|
| API do n8n sem chave | Não dá para contar/listar workflows programaticamente | Gerar API key no n8n e guardar em `.env` local |
| Token da Cloudflare ausente | Inventário de DNS/zonas incompleto; sem mapa domínio → cliente | Emitir token somente-leitura |
| Conta do conector do Drive indeterminada | Bloqueia toda automação Google | Verificar e reconectar os três conectores na mesma conta |
| OAuth Google não configurado | Gmail/Drive/Calendar via código indisponível | Criar credenciais OAuth por conta |
| Contas Meta com restrição | 6 de 8 contas não são consultáveis | Regularizar pendência financeira e revisão de segurança na Meta |
| Docker ausente no Mac | Não há paridade local com a VPS | Decisão consciente: não instalar agora ([ADR 0001](docs/adr/0001-sem-docker-local.md)) |

Passo a passo dos dois primeiros:
[docs/runbooks/desbloquear-integracoes.md](docs/runbooks/desbloquear-integracoes.md).

## Achados que exigem decisão do dono

Nenhum foi corrigido — corrigir exige aprovação de Nível 2 ou informação que só
o dono tem.

| ID | Severidade | Achado |
|---|---|---|
| V-001 | crítico | Debian 11 encerra o suporte LTS este mês; 193 dias sem reboot |
| V-002 | alto | Portas 2377 e 7946 do Swarm expostas em todas as interfaces |
| V-003 | alto | Arquivo com nome de backup de ambiente de produção em `/root` (não foi aberto) |
| V-004 | alto | Sem backup verificado para 3 PostgreSQL, MinIO e volumes |
| V-005 | médio | `novacena-music` rodando duplicado (Swarm + Compose) |
| V-006 | médio | `prune -af` diário elimina a possibilidade de rollback |
| F-001 | alto | `novacena-motion` é público e tem pipeline de deploy para a VPS |
| F-006 | médio | `novacena-editais` e `novacena-propostas` em produção sem repositório conhecido |
| — | alto | Token de acesso visível na URL de uma aba do navegador |

Detalhes em [docs/discovery/vps-inventory.md](docs/discovery/vps-inventory.md) e
[inventory/repositories.yaml](inventory/repositories.yaml).

## O que explicitamente **não** foi feito

- Nenhuma alteração na VPS (nem um arquivo, nem um container).
- Nenhuma alteração em repositório de cliente.
- Nenhuma alteração em DNS, Cloudflare, n8n, bancos ou campanhas.
- Nenhum envio de mensagem, e-mail ou publicação.
- Nenhum `force push`, nenhuma exclusão de recurso.
