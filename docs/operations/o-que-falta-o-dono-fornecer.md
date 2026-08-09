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
| Local (sua máquina) | arquivo modo `600` em diretório protegido; `.env` só para referências/caminhos |
| GitHub Actions | `Settings → Secrets and variables → Actions` |

O `.env.example` documenta apenas **nomes** de variáveis, nunca valores. Ao
adicionar uma credencial nova, acrescente o nome lá.

Antes de qualquer commit: `npm run scan:secrets`.

---

## Bloco 1 — Destrava vários clientes de uma vez

### 1.1 Entrar no n8n e criar acesso de inventário

**Destrava:** saber quais workflows existem, quais estão ativos, de que cliente
são e quais credenciais/processos dependem deles. É o maior ponto cego atual.

Em 08/08 a URL `n8n.automatizadoria.cloud` abriu normalmente, mas mostrou a
tela de login. O dono deve entrar pessoalmente na aba já aberta; **não enviar
senha no chat**. Depois, criar uma API key para inventário e guardá-la no
mecanismo local protegido. Isso não autoriza alteração de workflow.

### 1.2 Entrar no Meta Business Manager e decidir o escopo

**Destrava:** inventário das contas, páginas, Instagram e pixels; depois, a
medição pedida para os clientes.

Em 08/08 a sessão mostrou `Continuar com Facebook/Instagram`. O dono deve entrar
pessoalmente; **não enviar senha nem 2FA no chat**. Depois falta decidir:
operar Meta Ads ou somente instalar/auditar pixels. IDs anteriores estão
`stale` até nova conferência.

### 1.3 Token programático somente leitura da Cloudflare

**Destrava:** inventário reproduzível de zonas, DNS, Workers e Pages. A sessão
humana já foi verificada: conta `e6d7a4863004885bdae7e63bbec5e1f7`, 8 zonas
ativas e 14 projetos Workers/Pages.

Criar primeiro um token **somente leitura** (`Zone:Read`, `DNS:Read` e leitura
de Workers/Pages). `DNS:Edit` e deploy ficam para outro lote, com plano e
aprovação específicos.

### 1.4 Containers GTM que ainda não aparecem

Em 08/08 foram verificados no painel:

- Cássio: `GTM-5JGMZBKZ`
- Gabriel Gadelha: `GTM-5Z8QFW5B`
- Garbo: `GTM-W7CNZMLN`
- NovaCena: `GTM-P4RX9S2X`

Não apareceram containers de Sou Raízes, Chapéu de Bruxa e Encantaria. O dono
precisa confirmar se existem em outra conta; se não existirem, autorizar sua
criação quando os sites correspondentes estiverem definidos.

### 1.5 Itens já resolvidos — não fornecer de novo

- **GitHub:** `gh` autenticado como `dadocruz`, com leitura/escrita nos
  repositórios. Não precisa criar outro token agora.
- **Google Ads local:** conta de serviço e developer token estão em arquivos
  modo `600` no diretório protegido. `npm run governador` consultou a conta ao
  vivo em 08/08. Não duplicar o token em `.env`.
- **Google Cloud:** `gcloud` autenticado em
  `contato.automatizadoria@gmail.com`, projeto `automatizador-ia-ads`.
- **VPS:** SSH por `nvvps` funciona; o inventário somente leitura foi renovado.

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

### 2.1 Scripts e regras — conferência concluída

Em 08/08 foram encontrados somente dois scripts, ambos sem frequência:
`GARBO | NEGATIVAS | 20260728` (`12009767`) e
`GARBO | TRAVA R$100 | 20260728` (`11999683`). Não há regras automatizadas.
Nenhum script equivalente de Cássio ou NovaCena apareceu.

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
