# O que falta o dono fornecer

**Criado em 08/08/2026.** Lista de tudo que está bloqueado esperando algo que
só o dono tem: credencial, decisão de negócio ou arquivo.

Ordenada por **quanto cada item destrava**, não por esforço. Os primeiros
destravam vários clientes de uma vez; os últimos, um caso isolado.

## Como entregar credencial com segurança

**Nunca cole segredo no chat, em issue, em commit ou em documento.** O valor
fica no histórico e passa a existir em lugares que ninguém controla.

O caminho é sempre um destes dois:

| Onde roda | Onde o segredo mora |
|---|---|
| Local (sua máquina) | `.env` na raiz do repositório — já está no `.gitignore` |
| GitHub Actions | `Settings → Secrets and variables → Actions` |

O `.env.example` documenta apenas **nomes** de variáveis, nunca valores. Ao
adicionar uma credencial nova, acrescente o nome lá.

Antes de qualquer commit: `npm run scan:secrets`.

---

## Bloco 1 — Destrava vários clientes de uma vez

### 1.1 `GITHUB_TOKEN` (Personal Access Token)

**Destrava:** ler e corrigir os sites de todos os clientes sem depender de
clone manual, um a um.

Escopo mínimo: `repo` (leitura e escrita nos repositórios de cliente).
Gere em `github.com/settings/tokens`. Prefira token de granularidade fina, com
os repositórios listados explicitamente.

Hoje só o `dadocruz/cassio-ferraz` foi acessado, e por clone local.

### 1.2 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`

**Destrava:** DNS, Workers e deploy de todos os sites. Hoje o deploy do site do
Cássio é manual (`npx wrangler deploy`) e nenhum outro cliente é alcançável.

Escopo mínimo sugerido: `Zone:Read`, `DNS:Edit`, `Workers Scripts:Edit`.
Gere em `dash.cloudflare.com/profile/api-tokens`.

> ⚠️ DNS é destrutivo por natureza. Mesmo com o token, alteração de DNS
> continua exigindo sua aprovação específica — a regra do `CLAUDE.md` não muda
> por existir credencial.

### 1.3 `GOOGLE_ADS_DEVELOPER_TOKEN` no `.env` local

**Destrava:** rodar `npm run governador` e o monitor **fora do GitHub Actions**.

Hoje esse token só existe nos Actions secrets. Consequência prática: toda
verificação de saldo depende de disparar um workflow e esperar. Localmente o
comando falha com `GOOGLE_ADS_DEVELOPER_TOKEN ausente`.

O `.env` precisa de:

```
GOOGLE_ADS_DEVELOPER_TOKEN=<valor>
GOOGLE_ADS_KEY_PATH=<caminho para o JSON da conta de serviço>
```

O JSON da conta de serviço é lido **por caminho**, nunca por conteúdo colado.

### 1.4 Acesso ao Google Tag Manager de cada cliente

**Destrava:** criar as tags de WhatsApp que faltam (Sou Raízes, Chapéu de
Bruxa, Encantaria) e instalar o pixel da Meta em todos.

O container do Cássio é `GTM-5JGMZBKZ`. **Faltam os IDs de container dos
demais** e o acesso de publicação em cada um.

Sem isso, o checklist de `docs/operations/padrao-medicao-por-cliente.md` trava no item 1 para
todo cliente novo.

### 1.5 Acesso ao Meta Business Manager

**Destrava:** todo o trabalho de pixel da Meta, que você pediu para todos os
clientes.

Preciso de: acesso ao Business Manager e **o ID do pixel de cada cliente** (ou
autorização para criar os que não existem).

**Ainda não foi definido se a operação de Meta Ads entra no escopo** ou se é só
pixel para medição. São coisas diferentes — decida antes de eu começar.

---

## Bloco 2 — Higiene de acesso

> **Nada aqui é mais urgente por causa do incidente da Garbo.** Ele foi
> **fechado em 08/08**: a causa era o script legado
> `GARBO | TRAVA R$100 | 20260728` (ID `11999683`), agendado de hora em hora,
> com `START_DATE = 20260728` e pausa preventiva em R$ 90. Não houve acesso de
> terceiro. Ver o bloco `✅ INCIDENTE FECHADO` no `HANDOFF.md`.
>
> A frequência do script foi alterada para `Nenhuma` com aprovação do dono. O
> código segue intacto e o status `Ativado` — ele não foi apagado.

### 2.1 Existem outros scripts legados na conta?

**Destrava:** saber se há mais travas antigas prontas para brigar com o
governador do mesmo jeito que a da Garbo brigou.

O `GARBO | TRAVA R$100` foi encontrado por investigação de incidente, não por
inventário. **Nunca foi feita uma varredura de scripts da conta.** Se existir
um equivalente para o Cássio ou a NovaCena, ele vai agir na primeira vez que o
gasto cruzar o limiar dele — e ninguém saberá que existia.

Verificar em `Ferramentas → Ações em massa → Scripts` e em
`Ferramentas → Ações em massa → Regras`, listando **nome, frequência e o que
cada um faz**. Isso é leitura; posso fazer sozinho assim que tiver o caminho
confirmado.

### 2.2 Quem mais tem acesso à conta de anúncios `2656966896`?

**Destrava:** higiene, não emergência. Deixou de ser urgente quando o incidente
foi explicado por script e não por pessoa.

Lista de usuários da conta e da gerenciadora `3992594849`, em
`Administrador → Acesso e segurança`.

### 2.3 Rotações pendentes

- **Senha root da VPS** — foi colada em chat e precisa ser trocada.
- **TOTP em `clients/vivere/security.yaml`** — mesmo motivo.

Faça você mesmo; eu não devo executar troca de credencial.

---

## Bloco 3 — Decisões de negócio que travam a contabilidade

### 3.1 Valor da mensalidade de cada cliente

**Destrava:** o livro-caixa refletir a operação inteira, não só o saldo de
mídia.

A regra vigente é *mensalidade separada, Pix vai inteiro para anúncio*
(`comissao: 0.00`). Falta o valor da mensalidade por cliente para o relatório
mostrar a operação completa em vez de só a mídia.

### 3.2 Quais clientes têm contrato ativo, e quais estão só parados

**Destrava:** saber se campanha pausada é decisão ou esquecimento.

Hoje NovaCena e Gaveta estão com tudo pausado. Não está registrado se é pausa
temporária ou fim de contrato — e o governador trata os dois casos igual.

### 3.3 Meta de custo por conversa aceitável, por cliente

**Destrava:** o monitor alertar por resultado, não só por gasto.

Os números atuais: Garbo entrega conversa a **R$ 7,64**; Cássio a **R$ 26,69**
consolidado. São mercados diferentes — alugar mesa em Campinas é decisão de
minutos, contratar show de samba é decisão de milhares de reais.

Sem o seu limiar, o monitor só sabe dizer "gastou muito", nunca "gastou mal".

### 3.4 Quantas conversas viram contrato fechado?

**Destrava:** a única métrica que diz se a campanha se paga.

O Google Ads mede até a conversa. O que acontece depois está no WhatsApp, com
você e com a Viviane. Se uma em cada cinco conversas do Cássio fecha e um show
paga R$ 1.500, o custo por show contratado é ~R$ 133 — e aí R$ 26,69 por
conversa é barato. Sem esse número, ninguém sabe.

---

## Bloco 4 — Por cliente

### Gaveta / Buteco Sertanejo

**Mídia nova** para substituir o short reprovado por `COPYRIGHTED_CONTENT`.
A campanha `24105770570` **termina dia 11/ago** — os R$ 300 têm prazo.

Se a mídia não chegar antes, a campanha encerra sozinha e a verba volta ao
bolso comum sem ter veiculado nada.

### Sou Raízes e Chapéu de Bruxa

**Bloqueados por não terem site.** Sem site não há onde instalar tag nem pixel,
e sem tag não há como medir.

Decisão pendente: **loja própria ou marketplace?** Enquanto não for decidido,
nada avança nesses dois — nem tag, nem pixel, nem campanha.

### Encantaria

O Directus está **vazio** apesar do site estar no ar e haver CRM funcionando.
O conteúdo mora em lugar não mapeado.

Preciso de: onde o conteúdo é servido de verdade, e acesso ao repositório (ele
nunca foi clonado).

### Vivere

Além da rotação do TOTP, falta definir se entra na operação de tráfego ou se
segue só como projeto de infraestrutura.

---

## Bloco 5 — Dados operacionais que faltam

| Item | Por quê |
|---|---|
| Números de WhatsApp oficiais de cada cliente | Hoje só o do Cássio é conhecido (`5515991320687`, Viviane). Sem o número, a tag de WhatsApp não pode ser criada |
| Domínios confirmados por cliente | `inventory/domains.yaml` tem entradas com `likelyClient`, não com dono confirmado |
| Chave da API do n8n | Automação operacional na VPS segue inacessível |
| IDs de propriedade GA4 por cliente | Só o do Cássio é conhecido (`G-8WNMS2XFXR`) |

---

## O que NÃO preciso que você forneça

Para deixar claro e você não gastar tempo:

- **Acesso à VPS** — já existe, e a regra é somente leitura.
- **Acesso ao Google Ads** — já existe pela conta
  `contato.automatizadoria@gmail.com`.
- **Dados de campanha, gasto, cliques ou conversão** — leio da API.
- **Estado do repositório** — leio do git.

Se um item desta lista já foi resolvido, remova-o daqui em vez de deixar a
linha. Lista de pendências que não encolhe deixa de ser lida.
