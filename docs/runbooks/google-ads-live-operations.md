# Runbook — Google Ads em leitura ao vivo

Data: 2026-08-05 · **Nenhuma consulta ao vivo foi executada. Nenhuma alteração
no Google Ads.**

## Estado

| Campo | Valor |
|---|---|
| `authMode` | **`unavailable`** nesta máquina |
| `credentialReference` | nenhuma |
| `developerTokenConfigured` | **false** (ver aviso abaixo) |
| `loginCustomerIdConfigured` | true (constante conhecida: `3992594849`) |
| `liveReadVerified` | **false** |
| `writeActionsEnabled` | `false`, tipo literal em código |

## ⚠️ Incidente de credencial — rotação obrigatória

Em 2026-08-05 um **developer token do Google Ads foi colado em uma conversa de
chat**. Conversas são registradas, resumidas e persistidas.

**O token deve ser considerado comprometido e rotacionado**, independentemente
de o valor não ter sido gravado em nenhum arquivo deste repositório — e ele não
foi: a varredura de segredos cobre 150 arquivos com 0 achados.

**Como rotacionar:** Google Ads → Ferramentas e configurações → Configuração →
Central de API → gerar novo token. O antigo deixa de valer.

Registrar a rotação em `DECISIONS.md` quando concluída.

## Por que as credenciais não estão aqui

O projeto anterior (`google-ads-automation`) e o diretório `.secrets/google-ads`
vivem no **notebook do dono**, não nesta máquina. Confirmado por busca:
`~/Documents/Codex` existe, mas contém apenas pastas de sessão datadas — sem o
projeto e sem `.secrets/`.

Nenhuma credencial do Google Ads existe neste host: sem developer token, sem
OAuth, sem chave de conta de serviço, sem `gcloud`, sem `.env`.

## Como habilitar a leitura ao vivo

O `credential-provider` lê a chave **por caminho**, nunca por valor. O conteúdo
nunca entra na memória deste código.

**1. Diretório protegido**

```bash
mkdir -p ~/Documents/Codex/.secrets/google-ads && chmod 700 ~/Documents/Codex/.secrets/google-ads
```

**2. Chave da conta de serviço.** Transferir a existente do notebook, ou gerar
nova em `console.cloud.google.com` → projeto `automatizador-ia-ads` → IAM →
Contas de serviço → `google-ads-automation@…` → Chaves.

Nomes aceitos: `service-account.json`, `google-ads-automation.json`,
`credentials.json`, `key.json`, `automatizador-ia-ads.json`.

```bash
chmod 600 ~/Documents/Codex/.secrets/google-ads/service-account.json
```

**3. Developer token** (o novo, após rotação), sem ecoar na tela:

```bash
read -rs -p "Developer token: " T && printf 'GOOGLE_ADS_DEVELOPER_TOKEN=%s\n' "$T" >> .env && unset T && echo " gravado"
```

**4. Verificar** — reporta modo, permissão e dono, **sem abrir o arquivo**.

## Ressalva sobre conta de serviço

Conta de serviço só autentica no Google Ads com **delegação em todo o domínio**,
que exige Google Workspace. Se `automatizador-ia-ads` estiver sob conta Gmail
comum, esse fluxo **não funciona** e o caminho real é OAuth de usuário
(client ID + secret + refresh token).

Isso será detectado na primeira chamada e reportado como
`authMode: user_oauth` necessário — em vez de insistir no fluxo errado.

## Escopo autorizado

A conta `2656966896` é **compartilhada entre clientes**. O isolamento é por
campanha, não por conta — a plataforma não impede consulta cruzada. A allowlist
em `scope.ts` é essa barreira, do nosso lado.

| Campanha | Cliente | Situação |
|---|---|---|
| `24066140634` | cassio-ferraz | Demand Gen nacional, no escopo |
| (por nome exato) | buteco-sertanejo | `DG \| Buteco Sertanejo \| Shorts \| Spotify` |
| `24079586567` | gaveta-producoes | **`removed_by_owner`** — não reativar, não monitorar como ativa |

Garbo, NovaCena e demais recursos ficam fora por construção: consulta a eles é
erro de programa, não decisão de runtime.

## O que a leitura é autorizada a fazer

`listAccessibleCustomers`, `getAccountSummary`, `listCampaigns`, `getCampaign`,
`getCampaignBudget`, `getCampaignDailyMetrics`, `getCampaignConversions`,
`getCampaignChangeHistory`, `getConversionActions`, `getAdsAndPolicyStatus`,
`findCampaignByExactName`.

## O que é proibido neste ciclo

`create`, `update`, `remove`, `pause`, `enable`, `mutate`, mudança de orçamento,
de estratégia de lance e de meta de conversão.

Não é uma flag: **nenhum desses métodos existe na interface**, e há teste que
falha se algum aparecer. Além disso, `assertReadOnlyQuery` recusa qualquer GAQL
que não comece com `SELECT` ou que contenha verbo de escrita.

## Sobre o conflito de verba do Cássio Ferraz

**Não bloqueia leitura.** Bloqueia reativação, aumento de orçamento, publicação,
nova verba e qualquer mutate. Ler as métricas é justamente o que ajuda a
resolver o conflito.

## Conversões: WhatsApp é microconversão

Clique em WhatsApp é barato e frequente; lead qualificado é caro e raro. Somar
os dois infla o número e esconde o custo real por lead. O tipo
`ConversionBreakdown` tem `isMicroConversion` obrigatório — a distinção é
estrutural, não convenção de leitura.

## Depois da primeira execução ao vivo

Registrar: comando, método de autenticação, versão da API, clientes acessíveis,
horário, latência, request IDs sanitizados e erros. E confirmar: **nenhuma
alteração externa**.
