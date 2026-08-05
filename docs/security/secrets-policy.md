# Política de segredos

Documento normativo. Define o que é segredo, onde cada tipo pode viver, e o que
é terminantemente proibido neste repositório e nos agentes que operam sobre ele.

Última revisão: 2026-08-04

---

## 1. O que é tratado como segredo

| Categoria | Exemplos |
|---|---|
| Credenciais de API | tokens do GitHub, Google, Meta, Cloudflare, n8n, WhatsApp |
| Segredos OAuth | `client_secret`, `refresh_token`, `access_token` |
| Chaves criptográficas | chaves SSH privadas, chaves PGP, chaves de assinatura |
| Certificados com chave | `.pem`, `.p12`, `.pfx`, `.jks` |
| Credenciais de banco | usuário/senha, URL de conexão com credencial embutida |
| Webhooks com token | URLs de webhook do n8n que contenham segredo no caminho |
| Dados pessoais de cliente | listas de contatos, exportações de CRM, dumps |
| Segredos de infraestrutura | senha de root, chave de API do painel Hostinger |

Um endereço de e-mail administrativo, o nome de um host, um alias SSH ou o ID
numérico de uma conta de anúncios **não** são segredos — são metadados
operacionais e podem ser versionados neste repositório privado.

---

## 2. Onde cada segredo pode viver

| Segredo | Local autorizado | Local proibido |
|---|---|---|
| Token do GitHub | keychain do macOS, via `gh auth` | `.env`, código, docs |
| Chave SSH da VPS | `~/.ssh/`, referenciada por alias no `~/.ssh/config` | qualquer lugar do repo |
| Credenciais OAuth Google | `.env` local (não versionado) | `.env.example`, inventários |
| Token da Meta | `.env` local | inventários, logs |
| Token do n8n | `.env` local | docs, YAML de inventário |
| Token da Cloudflare | `.env` local | qualquer arquivo versionado |
| Segredos de produção | permanecem na VPS, fora do alcance deste repo | máquina de desenvolvimento |

Regra prática: **se um arquivo é versionado, ele não contém valor de segredo.**

---

## 3. Proibições absolutas

Nenhum script, agente, comando ou documento deste repositório pode:

- executar `cat`, `less`, `head`, `tail` ou `grep` sobre arquivos `.env` de
  qualquer ambiente, local ou remoto;
- executar `printenv`, `env` ou `set` em host de produção;
- executar `docker inspect` completo, `docker compose config` sem filtro, ou
  qualquer comando que despeje variáveis de ambiente de containers;
- imprimir o conteúdo de uma chave privada, mesmo parcialmente;
- registrar valores de autenticação em log, inventário, issue ou commit;
- transmitir segredo por chat, e-mail ou mensagem;
- gravar segredo em arquivo dentro de `clients/`, `inventory/` ou `docs/`.

Quando um inventário precisar referenciar uma credencial, ele registra apenas:
**existência**, **finalidade**, **local de armazenamento** e **status** — nunca
o valor. Ver `inventory/accounts.yaml`.

---

## 4. Redação em logs

O logger da aplicação (`packages/shared`) aplica redação antes da serialização.
Campos cujo nome casa com `password`, `secret`, `token`, `apiKey`, `authorization`,
`credential`, `privateKey`, `cookie` e variantes são substituídos por `[REDACTED]`.
Valores que casam com assinaturas conhecidas de token também são redigidos,
mesmo quando o nome do campo é inocente.

Isso vale para logs de erro. Uma exceção de integração pode carregar o header de
autenticação no corpo — por isso o erro também passa pelo redator.

---

## 5. Varredura pré-commit

`scripts/scan-secrets.sh` verifica arquivos em *stage* antes do commit.

Detecta:

- nomes de arquivo proibidos (`.env`, `.pem`, `id_rsa`, `client_secret*.json`, …);
- chaves privadas em formato PEM/OpenSSH;
- tokens do GitHub, Anthropic, OpenAI, AWS, Google, Meta, Slack, Stripe,
  SendGrid, Twilio;
- JSON Web Tokens;
- URLs de conexão com credencial embutida;
- atribuições genéricas do tipo `password=`, `secret:`, `api_key =` com valor
  de tamanho plausível.

Reporta **arquivo, linha e tipo provável**. Nunca o valor.

**Limitações conhecidas** — este scanner é heurístico:

- Segredos de alta entropia sem prefixo reconhecível (ex.: um token hexadecimal
  de 32 caracteres solto) podem passar.
- A lista de placeholders aceitos (`<...>`, `changeme`, `example`, `${VAR}`)
  pode, em teoria, mascarar um valor real que contenha essas palavras.
- Ele varre o conteúdo em *stage*, não o histórico. Segredo já commitado não é
  detectado por ele.

Portanto: o scanner reduz risco, não o elimina. Revisão humana continua obrigatória.

Escape consciente: uma linha marcada com `pragma: allowlist-secret` é ignorada.
Use isso apenas quando tiver verificado que não há segredo real.

---

## 6. Procedimento de exposição

Se um segredo for exposto — em commit, log, captura de tela ou mensagem:

1. **Rotacione imediatamente** na plataforma de origem. Não espere pela limpeza.
2. Revogue a credencial antiga.
3. Emita nova credencial e atualize o `.env` local.
4. Verifique logs de acesso da plataforma em busca de uso indevido.
5. Registre o incidente em `DECISIONS.md`: data, plataforma, escopo do segredo,
   janela de exposição, ação tomada.
6. Avalie limpeza de histórico apenas depois da rotação, e nunca com `force push`
   unilateral.

Um segredo em repositório privado que vazou continua sendo um segredo vazado.
O tratamento é o mesmo de um repositório público.

---

## 7. Revisão

Esta política é revisada sempre que:

- uma nova integração é adicionada ao Control Plane;
- um incidente de exposição ocorre;
- o escopo de permissões de alguma conta muda.
