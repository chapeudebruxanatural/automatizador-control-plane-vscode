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

### 1.1 n8n — concluído, não fornecer novamente

**Destrava:** saber quais workflows existem, quais estão ativos, de que cliente
são e quais credenciais/processos dependem deles. É o maior ponto cego atual.

O dono autorizou a chave ampla temporária em 09/08. Ela expira em 16/08, está
fora do Git em arquivo modo `600` e só é usada por cliente local GET-only. A API
confirmou 33 workflows: 1 ativo, 32 inativos e 3 arquivados. Falta ao dono
confirmar a associação workflow → cliente; todos seguem `unknown` de propósito.

### 1.2 Inventariar o Meta Business Manager

**Destrava:** inventário das contas, páginas, Instagram e pixels; depois, a
medição pedida para os clientes.

Login concluído. O dono decidiu que o escopo inclui **campanhas, pixels e
medição**. Falta mapear Business Managers, contas de anúncio, páginas,
Instagram e datasets/pixels; IDs anteriores continuam `stale` até conferência.

### 1.3 Cloudflare — concluído, não fornecer novamente

**Destrava:** inventário reproduzível de zonas, DNS, Workers e Pages. A sessão
humana já foi verificada: conta `e6d7a4863004885bdae7e63bbec5e1f7`, 8 zonas
ativas e 14 projetos Workers/Pages.

Token somente leitura criado e validado em 09/08, restrito à conta e com
expiração em 06/11. O valor está fora do Git, em arquivo modo 600. A API
confirmou 8 zonas, 14 DNS, 10 Pages, 3 Workers, 6 domínios de Worker e 0 túneis.
`DNS:Edit` e deploy continuam fora deste lote.

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

Em 08/08 o dono adiou ambas até a plataforma estar testada e validada. O risco
continua aberto; o adiamento não equivale a resolução.

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

**Reivindicação de direito autoral.** A mídia substituta também foi rejeitada,
apesar de usar trilha própria. O dono fará a reivindicação quando puder. A
campanha `24105770570` continua congelada e não deve ser alterada.

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
| Associação dos 33 workflows do n8n aos clientes | Nomes são pistas, não prova; o comando de confirmação deve ser respondido por cliente |
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
