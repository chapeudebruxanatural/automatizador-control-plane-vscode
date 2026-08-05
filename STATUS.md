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
| Docker ausente no Mac | Não há paridade local com a VPS | Decisão consciente: não instalar agora; desenvolver sem container |
| OAuth Google não configurado | Gmail/Drive/Calendar via código indisponível | Criar credenciais OAuth na conta canônica |
| Token da Cloudflare ausente | Inventário de DNS/zonas incompleto | Emitir token somente-leitura |
| Contas Meta com restrição | 6 de 8 contas não são consultáveis | Regularizar pendência financeira e revisão de segurança na Meta |

## O que explicitamente **não** foi feito

- Nenhuma alteração na VPS (nem um arquivo, nem um container).
- Nenhuma alteração em repositório de cliente.
- Nenhuma alteração em DNS, Cloudflare, n8n, bancos ou campanhas.
- Nenhum envio de mensagem, e-mail ou publicação.
- Nenhum `force push`, nenhuma exclusão de recurso.
