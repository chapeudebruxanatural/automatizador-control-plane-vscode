# Integrações — panorama

Estado real de cada sistema externo em 2026-08-04. O detalhe estruturado está em
`inventory/integrations.yaml` e `inventory/accounts.yaml`; aqui fica o
julgamento sobre cada um.

Legenda de prontidão: **pronto** (dá para integrar já) · **parcial** (falta algo)
· **bloqueado** (falta credencial ou decisão).

---

## GitHub — pronto

`gh` CLI autenticado como `dadocruz`, token no keychain do macOS, escopos
`repo`, `workflow`, `read:org`, `gist`. Permissão de escrita confirmada.

É a integração mais madura e a única já exercitada de ponta a ponta — este
repositório foi criado e publicado por ela.

Não tem `delete_repo` nem `admin:org`, o que é uma boa restrição: o token não
consegue apagar repositório mesmo que alguém peça.

**Próximo passo:** `GitHubAdapter` real em modo leitura, sobre o `gh` CLI.

---

## VPS Hostinger — pronto (somente leitura)

Alias `nvvps`, chave SSH sem senha, acesso **root**. Debian, Docker 28.5.1 e
Compose v2.40.3.

Acesso root é conveniente e perigoso na mesma medida: não existe erro de digitação
inofensivo. Por isso a política é somente leitura, e o adaptador real deverá
operar com lista branca de comandos — não com "qualquer comando menos os
proibidos". Lista branca falha fechada; lista negra falha aberta.

**Próximo passo:** `VpsAdapter` com lista branca explícita.

---

## n8n — bloqueado

Roda na VPS. Identificado no inventário de containers. A API REST exige uma
chave que ainda não existe.

É o maior ponto cego da operação: os processos dos clientes passam por ele e
nenhum está documentado fora do próprio n8n. Enquanto isso não mudar, qualquer
mudança de infraestrutura corre o risco de quebrar um processo que ninguém sabia
que existia.

**Bloqueio:** gerar API key no n8n e guardar em `.env` local.

---

## Cloudflare — bloqueado

Há dashboard acessível na sessão do navegador e vários repositórios usam
`wrangler.toml`, `_headers` e `_redirects`. Nenhum token de API disponível.

Sem token não dá para inventariar zonas, DNS nem túneis — e é justamente aí que
mora a relação entre domínio e cliente, hoje o maior buraco do catálogo.

**Bloqueio:** emitir token **somente leitura** (Zone:Read, DNS:Read).

---

## Google — bloqueado, e com regra própria

Duas contas, separadas por instrução do dono:

- `contato.automatizadoria@gmail.com` — canônica da AutomatizadorIA
- `estudionovacena@gmail.com` — exclusiva da Novacena

Os conectores do Claude estão ligados à conta Novacena (Gmail, Calendar), mas o
Drive devolve arquivos da conta AutomatizadorIA. **Isso é exatamente a mistura
que a regra proíbe** e precisa ser resolvido antes de qualquer automação Google.

O `GoogleAdapter` recebe a conta como parâmetro obrigatório e a implementação
real deve recusar operar entre contas diferentes numa mesma ação. Separação como
regra de código, não como disciplina de uso.

Existe um site de conformidade (`automatizadoria-compliance-site`) preparado para
a verificação do Google OAuth — o pré-requisito para sair do modo de teste.

**Bloqueio:** credenciais OAuth por conta, com escopos separados.

---

## Meta Ads — parcial

MCP ativo, cerca de 100 ferramentas, CRUD completo. Oito contas acessíveis,
todas em BRL — mas só **duas** utilizáveis:

| Situação | Contas |
|---|---|
| Ativas e consultáveis | 2 |
| Desabilitadas por revisão de segurança | 4 |
| Com pendência financeira | 2 |

O gargalo não é técnico. Quatro contas foram sinalizadas por atividade incomum e
exigem contato com o Facebook; duas têm pendência de pagamento. Automação não
resolve nenhum dos dois.

**Próximo passo:** regularizar as contas antes de investir em automação de
tráfego. E manter campanha em Nível 2 do protocolo de aprovação — aqui se gasta
dinheiro real.

---

## WhatsApp — desligado por decisão

Fora de escopo nesta fase. É o único canal que fala diretamente com o cliente
final: um erro é público, imediato e irreversível. Uma mensagem enviada não
volta.

Entra depois que kill switch, aprovação e auditoria estiverem exercitados em
canais de menor consequência.

---

## Ordem recomendada

1. **Cloudflare (leitura)** — destrava o mapa domínio ↔ cliente, que é a maior
   lacuna do catálogo, e o token é barato de emitir.
2. **n8n (leitura)** — remove o maior ponto cego operacional.
3. **GitHub (leitura)** — já está pronto; formaliza o que hoje é script.
4. **VPS (leitura com lista branca)** — formaliza o inventário recorrente.
5. **Google** — depende de OAuth e da resolução do cruzamento de contas.
6. **Meta** — depende de regularização administrativa.
7. **WhatsApp** — por último, com auditoria madura.

Os dois primeiros são leitura pura, custam um token cada, e devolvem o maior
ganho de conhecimento por unidade de risco.
