# STATUS

Última atualização: **2026-08-08**

## Checkpoint atual — incidente da Garbo

- **Branch:** `main`; árvore limpa antes das atualizações documentais.
- **Validação local:** lint + typecheck + **260/260 testes em 71 suítes** +
  build + `scan:secrets:all` (183 arquivos, zero achados), tudo verde.
- **Kill switch:** ligado. As únicas escritas externas foram as duas ações
  aprovadas pelo dono: remover o agendamento legado e reativar três campanhas.
- **Google Ads:** leitura pela interface autenticada na conta anunciante
  `2656966896`. A API local foi destravada em 08/08 por referência a arquivo
  protegido; o valor do developer token não entra em `.env`, log ou commit.
  Nenhum valor de credencial foi exibido.
- **Incidente da Garbo:** fechado. O script horário
  `GARBO | TRAVA R$100 | 20260728` (`11999683`) pausou as três campanhas às
  14:49 de 07/08 após reativação manual às 14:25.
- **Causa:** script ainda soma gasto desde 28/07 e pausa em R$ 90. O lote novo
  de 07/08 foi reativado sem atualizar a janela da trava.
- **Trava neutralizada com aprovação:** frequência do script alterada de
  `Por hora` para `Nenhuma`; script, código e status `Ativado` preservados.
- **Divergência real em 08/08 às 23:20:** 24016194642/645/648 continuam ativas
  com R$ 6/R$ 5/R$ 3 por dia, mas 24016194651/654 também apareceram ativas a
  R$ 8/R$ 12. O livro-caixa diz pausadas; nenhuma correção foi aplicada sem
  aprovação.
- **Relatórios:** Garbo 0 em `WhatsApp | GARBO` em 07/08 e 0 em 08/08 até 09:04.
  Cássio consolidado: R$ 373,63, 1.388 cliques, 14 em `WHATSAPP - CÁSSIO` e
  R$ 26,69 por WhatsApp; São Paulo 9, Goiânia 2, Brasília 2 e Rio de Janeiro 1
  por região de segmentação.
- **Cássio:** marcador `CASSIO_CONVERTING`; API confirmou 14 contatos na
  campanha diária desde 06/08, com R$ 153,60 e 982 cliques.

O restante deste arquivo é um checkpoint histórico de 05/08 e está superado
onde conflitar com `CONTINUAR-AQUI.md` e `HANDOFF.md`.

## Checkpoint histórico — Ciclo 2 (estabilização operacional)

- **Branch:** `feat/operational-stabilization-v1`
- **HEAD:** ver `git log` (branch à frente de `main`, que está em `4b567d3`)
- **Testes:** 142/142 passando · lint, typecheck e build limpos · CI verde em Node 20.11.0 e 24
- **Kill switch:** ligado (`engaged`) · **Modo de execução:** `dry-run`
- **Integrações reais conectadas:** nenhuma. Cloudflare e n8n seguem bloqueados
  por falta de credencial; WhatsApp em homologação com `writeActionsEnabled`
  fixo em `false` no código
- **Alterações em plataforma externa nesta branch:** nenhuma — VPS, GitHub
  (leitura), Cloudflare e n8n só foram lidos

## Onde estamos

Fundação estabelecida no Ciclo 1. O Ciclo 2 adicionou: revisão de risco da
VPS com correção de um achado anterior, scripts de backup/restore testados,
parsers de Cloudflare e n8n (ainda sem credencial para uso real), histórico de
Google Ads importado, contexto estruturado do VIVERE 360, modelo de usuário
operacional da VPS (não criado) e um módulo de WhatsApp em homologação.
**Nenhuma integração externa executa ação de escrita.**

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
| Backup (scripts) | 🟡 construído, não instalado | `scripts/backup/`, testado com dados sintéticos; falta rodar `--apply` na VPS |
| Retenção de imagens Docker | 🟡 simulador pronto | `scripts/docker-retention-*.sh`; substituir o cron exige Nível 2 |
| Cloudflare (leitura) | 🟡 parser pronto, sem credencial | `packages/integrations/src/cloudflare/parser.ts` |
| n8n (leitura) | 🟡 parser pronto, sem credencial | `packages/integrations/src/n8n/parser.ts` |
| Google Ads | 📗 histórico importado | Nenhuma conexão à API; ver `inventory/google-ads.yaml` |
| VIVERE 360 | 📗 contexto estruturado | Sem alteração no repositório do cliente |
| Usuário operacional da VPS | 🟡 modelo pronto, usuário não criado | `docs/security/vps-operator-model.md` |
| WhatsApp / Evolution API | 🟡 homologação | `writeActionsEnabled=false` fixo no código; número real não conectado |

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
| R-001 | crítico | Backup existente cobre 1 de 13 stacks (corrige V-004 do Ciclo 1) |
| R-002 | crítico | O backup existente provavelmente arquiva a cópia errada (checkout do Git, não os volumes vivos) |
| V-002 / R-003 | alto | Portas 2377 e 7946 do Swarm expostas em todas as interfaces |
| V-003 / R-004 | alto | Arquivo com nome de backup de ambiente de produção em `/root` (não foi aberto) |
| F-001 | alto | `novacena-motion` é público e tem pipeline de deploy para a VPS |
| R-005 | médio | `prune -af` diário elimina a possibilidade de rollback (0B recuperados hoje, mas materializa no próximo deploy) |
| R-007 | médio | `novacena-music` duplicado — o Swarm recebe tráfego, o Compose não (corrige inferência do Ciclo 1) |
| F-006 | médio | `novacena-editais` e `novacena-propostas` em produção sem repositório conhecido |
| — | alto | Incidente de TOTP da conta `contato.automatizadoria@gmail.com` — registrado, não revogado (Nível 2) |
| — | alto | Token de acesso visível na URL de uma aba do navegador (Ciclo 1, ainda não confirmado como rotacionado) |

**Correção relevante:** V-004 do Ciclo 1 ("sem backup verificado") estava
parcialmente errado — existe backup diário externo (S3), mas cobre apenas o
NovaCena Motion e há suspeita fundada de que arquiva a origem errada. Ver
[docs/discovery/vps-risk-review.md](docs/discovery/vps-risk-review.md).

Detalhes em [docs/discovery/vps-inventory.md](docs/discovery/vps-inventory.md),
[docs/discovery/vps-risk-review.md](docs/discovery/vps-risk-review.md) e
[inventory/repositories.yaml](inventory/repositories.yaml).

## O que explicitamente **não** foi feito

- Nenhuma alteração na VPS (nem um arquivo, nem um container, nem o cron).
- Nenhuma alteração em repositório de cliente (GitHub `vivere` só foi lido).
- Nenhuma alteração em DNS, Cloudflare, n8n, bancos ou campanhas.
- Nenhum envio de mensagem, e-mail ou publicação.
- Nenhum `force push`, nenhuma exclusão de recurso.
- Usuário operacional `automatizador` da VPS **não foi criado** — só o modelo.
- Nenhum workflow do n8n foi executado, ativado ou desativado.
- Nenhum número de WhatsApp real foi conectado; nenhuma mensagem foi enviada.
- Fator MFA da conta `contato.automatizadoria@gmail.com` **não foi revogado**
  (incidente registrado, aguardando decisão humana).
- Nenhum merge para `main` — a branch `feat/operational-stabilization-v1`
  segue separada.
