# Matriz de contas e acessos

Data: 2026-08-04 · Dados estruturados: [`inventory/accounts.yaml`](../../inventory/accounts.yaml)

Este documento registra **quem alcança o quê**, e com qual permissão. Não contém
nenhum valor de autenticação — nem token, nem senha, nem chave.

---

## Regra de separação das contas Google

> **Conta canônica da AutomatizadorIA:** `contato.automatizadoria@gmail.com`
> **Conta separada da Novacena:** `estudionovacena@gmail.com`
>
> Não se misturam arquivos, e-mails, agendas, contatos ou recursos entre elas.
> Nenhuma automação pode ler de uma e escrever na outra.

Isso é regra do dono, registrada em 2026-08-04, e vale como restrição de código:
o `GoogleAdapter` recebe a conta como parâmetro obrigatório, e a implementação
real deve **recusar** operação que envolva as duas contas na mesma ação.

### ⚠️ A regra está sendo violada hoje

| Conector | Conta que responde |
|---|---|
| Gmail | `estudionovacena@gmail.com` |
| Calendar | `estudionovacena@gmail.com` |
| **Drive** | **devolve arquivos de `contato.automatizadoria@gmail.com`** |

Não foi possível determinar por qual conta o conector do Drive autentica. Há
duas explicações, e ambas são problema:

1. O conector do Drive está na conta AutomatizadorIA enquanto Gmail e Calendar
   estão na Novacena — as duas contas alcançáveis na mesma sessão.
2. O conector está na conta Novacena, que enxerga arquivos da AutomatizadorIA
   por compartilhamento — a separação já foi rompida no próprio Drive.

**Isto precisa ser resolvido antes de qualquer automação Google.** Enquanto não
for, uma automação escrita de boa-fé pode gravar arquivo de cliente na conta
errada.

---

## Matriz

Legenda: ✅ disponível · ⚠️ com ressalva · ⛔ bloqueado ou proibido

| Plataforma | Conta | Leitura | Escrita | Criação | Exclusão | Autenticação | Armazenamento | Risco |
|---|---|:--:|:--:|:--:|:--:|---|---|:--:|
| GitHub | `dadocruz` | ✅ | ✅ | ✅ | ⛔ | `gh` CLI (OAuth) | keychain macOS | médio |
| VPS Hostinger | `root@automatizadoria` | ✅ | ⚠️ | ⚠️ | ⚠️ | chave SSH | `~/.ssh` | **alto** |
| Google (canônica) | `contato.automatizadoria@` | ⛔ | ⛔ | ⛔ | ⛔ | — | — | médio |
| Google (Novacena) | `estudionovacena@` | ⛔ | ⛔ | ⛔ | ⛔ | — | — | médio |
| Gmail | `estudionovacena@` | ✅ | ✅ rascunho | ✅ rascunho | ⛔ | conector Claude | Claude | médio |
| Calendar | `estudionovacena@` | ✅ | ✅ | ✅ | ⚠️ | conector Claude | Claude | médio |
| Drive | **indeterminada** | ✅ | ✅ | ✅ | ⛔ | conector Claude | Claude | **alto** |
| Meta Ads | 8 contas | ✅ | ✅ | ✅ | ✅ | conector MCP | conector | **alto** |
| Cloudflare | desconhecida | ⛔ | ⛔ | ⛔ | ⛔ | só navegador | navegador | médio |
| n8n | desconhecida | ⛔ | ⛔ | ⛔ | ⛔ | — | — | **alto** |
| WhatsApp (Evolution) | instâncias na VPS | ⛔ | ⛔ | ⛔ | ⛔ | interna | volume Docker | **alto** |
| Navegador (Chrome) | sessões do dono | ✅ | ✅ | ✅ | ✅ | sessões abertas | perfil Chrome | **alto** |
| Claude Code | `estudionovacena@` | ✅ | ✅ local | ✅ local | ⛔ | sessão Claude | Claude | médio |

**Sobre a VPS:** o acesso técnico é root e permite tudo. A ⚠️ nas colunas de
escrita reflete **política**, não capacidade. E política sozinha falha — por
isso `scripts/collect-vps-inventory.sh` recusa comandos mutantes em código, não
só em prosa.

**Sobre o Gmail:** o conector não tem ferramenta de envio. Ele cria rascunhos.
Nenhum e-mail sai por ele.

---

## Onde cada credencial vive

| Local | O que guarda | Avaliação |
|---|---|---|
| Keychain do macOS | token do GitHub | Bom. Protegido pelo SO, não duplicado em arquivo. |
| `~/.ssh` | chave da VPS | Aceitável, com ressalva: **sem passphrase**. |
| Conectores do Claude | OAuth de Gmail, Calendar, Drive, Meta | Fora do nosso controle direto. |
| Perfil do Chrome | sessões de Cloudflare, GitHub, WhatsApp | Amplo e pouco auditável. |
| **Nenhum lugar** | n8n, Cloudflare (API) | São os bloqueios ativos. |
| **Repositório** | nada | E assim permanece. |

---

## Ações necessárias, por prioridade

| # | Ação | Por quê |
|---|---|---|
| 1 | Resolver o conflito de contas do conector do Drive | Viola a regra de separação do dono |
| 2 | Rotacionar o token exposto na URL de uma aba do navegador | Credencial **já** exposta |
| 3 | Gerar API key somente leitura do n8n | Maior ponto cego da operação |
| 4 | Emitir token somente leitura da Cloudflare | Destrava o mapa domínio → cliente |
| 5 | Criar usuário não-root na VPS para inventário | Reduz o raio de um erro |
| 6 | Regularizar as 6 contas Meta restritas | Bloqueia serviço já vendido |
| 7 | Avaliar passphrase na chave SSH | Chave sem senha = produção em um arquivo |
| 8 | Token do GitHub com escopo reduzido para o Control Plane | Separar automação de uso pessoal |

Nenhuma dessas ações foi executada. Todas dependem de decisão ou de credencial
que só o dono pode emitir.

---

## Riscos estruturais

**Concentração.** Uma pessoa, uma conta GitHub, uma chave SSH, um navegador.
Não há redundância nem plano de continuidade. Indisponibilidade do dono é
indisponibilidade da operação.

**Permissão além da necessidade.** Meta Ads tem CRUD completo sobre verba real.
A VPS é root. O navegador herda tudo. Em nenhum desses casos a permissão foi
dimensionada pela tarefa — foi herdada do acesso administrativo.

**Auditabilidade desigual.** GitHub e VPS deixam rastro. Navegador quase não
deixa. Quanto mais uma tarefa depender do navegador, menos se saberá depois o
que foi feito.

**Credenciais no lugar errado.** Além do token na URL, o inventário da VPS
encontrou em `/root` um arquivo cujo nome indica cópia de variáveis de ambiente
de produção (achado V-003). Ele **não foi aberto**, e deve ser tratado como
comprometido: rotacionar primeiro, remover depois.
