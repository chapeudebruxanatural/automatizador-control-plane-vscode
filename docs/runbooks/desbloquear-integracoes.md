# Runbook — desbloquear as integrações de leitura

Como gerar as credenciais que hoje bloqueiam o Control Plane.

**Nenhum passo aqui altera produção.** Todos criam credenciais de leitura ou
verificam configuração existente.

> **Regra que vale para todos os passos:** o valor da credencial vai para o
> arquivo `.env` local, que nunca é versionado. Não cole valor em chat, em
> issue, em commit ou em documento. Se um valor for exposto em qualquer lugar,
> ele passa a ser um segredo vazado — rotacione antes de qualquer outra coisa.

---

## 1. API key do n8n

**Destrava:** contagem e classificação de workflows, mapa workflow → cliente,
erros recentes. É o bloqueio de maior impacto do projeto.

**Risco:** nenhum. A chave é de leitura e não altera workflow algum.

### Passos

1. Abra a interface do n8n (o endereço está na configuração do Traefik; se não
   souber, o serviço é `n8n_n8n_editor` na porta interna 5678).
2. Vá em **Settings → n8n API**.
3. Clique em **Create an API key**.
4. Dê um nome que identifique o uso, por exemplo `control-plane-readonly`.
5. Copie o valor **uma vez** — ele não é exibido de novo.
6. No repositório, adicione ao `.env` local:

```
N8N_API_KEY=<cole-o-valor-aqui>
N8N_BASE_URL=<url-do-n8n>
```

### Verificação

```bash
grep -c "^N8N_API_KEY=." .env
```

Deve responder `1`. Isso confirma que a variável tem valor **sem imprimi-lo**.

Depois, `/status` passa a reportar `n8n.credentialConfigured: true` — presença,
nunca o valor.

---

## 2. Token somente leitura da Cloudflare

**Destrava:** zonas, registros DNS e o mapa domínio → cliente, hoje a maior
lacuna do catálogo.

**Risco:** nenhum, **desde que o token seja criado apenas com permissões de
leitura**. Não use o token global da conta.

### Passos

1. Acesse **My Profile → API Tokens** no painel da Cloudflare.
2. **Create Token → Create Custom Token**.
3. Nome: `control-plane-readonly`.
4. Permissões — exatamente estas duas, e nenhuma a mais:
   - `Zone` → `Zone` → **Read**
   - `Zone` → `DNS` → **Read**
5. Zone Resources: `All zones` (ou apenas as zonas relevantes).
6. Recomendado: restrinja por IP e defina data de expiração.
7. Crie, copie o valor e adicione ao `.env` local:

```
CLOUDFLARE_API_TOKEN=<cole-o-valor-aqui>
CLOUDFLARE_ACCOUNT_ID=<id-da-conta>
```

> Se em algum momento a interface oferecer permissões de **Edit**, é sinal de
> que o token errado está sendo criado. Só `Read`.

### Verificação

```bash
grep -c "^CLOUDFLARE_API_TOKEN=." .env
```

---

## 3. Conta do conector do Google Drive

**Destrava:** qualquer automação Google.

**Risco:** nenhum na verificação. A reconexão, se necessária, é reversível.

### Contexto

O diagnóstico encontrou uma inconsistência: Gmail e Calendar respondem pela
conta Novacena (`estudionovacena@gmail.com`), mas a listagem do Drive devolveu
arquivos de `contato.automatizadoria@gmail.com`.

Há duas explicações possíveis, e ambas violam a regra de separação:

1. O conector do Drive está autenticado na conta AutomatizadorIA, enquanto
   Gmail e Calendar estão na Novacena.
2. O conector está na Novacena, que enxerga arquivos da AutomatizadorIA por
   compartilhamento — a separação já foi rompida no próprio Drive.

### Passos

1. Nas configurações de conectores do Claude, verifique **qual conta Google**
   autentica cada um dos três conectores.
2. Se estiverem em contas diferentes, decida qual conta o Control Plane deve
   usar e reconecte os três na mesma.
3. Se estiverem na mesma conta, então o cruzamento vem de compartilhamento no
   Drive. Revise o que está compartilhado entre as duas contas.
4. Registre a decisão em `DECISIONS.md` e atualize
   `docs/security/access-matrix.md`.

---

## 4. Usuário não-root na VPS para inventário

**Destrava:** inventário recorrente com raio de erro menor.

**Risco:** baixo, mas **é escrita** — cria usuário. Exige aprovação de Nível 2 e
uma janela combinada.

### Esboço

1. Criar usuário sem privilégio de escrita.
2. Adicioná-lo ao grupo `docker` — atenção: **acesso ao socket do Docker
   equivale a root**. Se isso for inaceitável, a alternativa é `sudo` com lista
   branca de comandos de leitura.
3. Instalar chave pública dedicada, com passphrase.
4. Adicionar entrada no `~/.ssh/config` local.
5. Rodar `scripts/collect-vps-inventory.sh <novo-alias>` e conferir que a saída
   é equivalente.
6. Só então trocar o alias padrão.

> Isso está fora do escopo desta fase. Documentado aqui para não se perder.

---

## Depois de desbloquear

Com n8n e Cloudflare disponíveis:

```bash
npm run verify    # lint, typecheck, teste, build
```

E siga o Bloco 4 de [proximos-passos.md](../operations/proximos-passos.md):
adaptadores reais, sempre em leitura, atrás do kill switch.

Nenhuma credencial nova deve ser usada para escrita sem passar pelo
[protocolo de aprovação](../../brain/operations/protocolo-de-aprovacao.md).
