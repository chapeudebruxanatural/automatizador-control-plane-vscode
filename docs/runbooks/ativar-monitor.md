# Ativar o monitor contínuo

**Objetivo:** sair de `MONITOR_NOT_DEPLOYED` para vigilância real, sem sessão
aberta.

O workflow `.github/workflows/monitor.yml` já está no repositório e o script já
foi testado rodando **sem `.env` e sem o diretório de segredos**, com a
credencial chegando só por caminho. Falta uma coisa: **dois secrets no GitHub**.

Isso o dono precisa fazer — envolve colar valor de credencial, e agente não
manipula valor de segredo.

---

## O que cadastrar

Em `github.com/dadocruz/automatizador-control-plane` →
**Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

### 1. `GOOGLE_ADS_DEVELOPER_TOKEN`

O mesmo token que está no `.env` local. Para ver o valor sem imprimir na tela
inteira:

```bash
grep '^GOOGLE_ADS_DEVELOPER_TOKEN=' ~/Projetos/automatizador-control-plane/.env | cut -d= -f2- | pbcopy
```

Isso copia direto para a área de transferência. Cole no campo do GitHub.

### 2. `GOOGLE_ADS_SERVICE_ACCOUNT_JSON`

O JSON inteiro da conta de serviço, incluindo chaves e quebras de linha:

```bash
cat ~/Documents/Codex/.secrets/google-ads/service-account.json | pbcopy
```

Cole no campo do GitHub. O workflow materializa num arquivo temporário com modo
600, usa por caminho, e apaga no fim.

---

## Conferir que funcionou

**Actions** → **Monitor de campanhas** → **Run workflow**.

Saída esperada:

```
=== Cássio Ferraz — campanha 24066140634 ===
status: ENABLED / ELIGIBLE   orçamento: R$ 472.94

  2026-07-29 | R$   72.84 |  554 cliques | CPC  0.13 | WhatsApp 5
  ...
7 dias: R$ 97.84 | 619 cliques | 5 contatos
Sem alertas.
```

Se aparecer `Secret GOOGLE_ADS_SERVICE_ACCOUNT_JSON ausente`, o segundo secret
não foi salvo.

---

## O que o monitor faz

Roda às **06:00 e 18:00** de Brasília, e sob demanda. Alerta quando:

| Condição | Por quê |
|---|---|
| CPC do dia > R$ 1,00 | está comprando clique caro — o melhor dia teve R$ 0,13 |
| Gasto acumulado > R$ 400 | teto de alerta antes do limite de R$ 472,94 |
| > R$ 100 num dia sem contato novo | gastou sem retorno |

**Somente leitura.** Nenhum mutate, nenhuma alteração de campanha. O workflow
roda com `permissions: contents: read` e o transporte recusa GAQL que não comece
com `SELECT`.

---

## O que ainda falta depois disso

O monitor **imprime** o alerta no log do Actions. Ele ainda não **avisa** —
não manda WhatsApp nem e-mail. Ver o alerta exige abrir o Actions.

Fechar essa lacuna é parte da fase 3 em
`docs/architecture/agent-platform.md`, e depende de homologar o payload real da
Evolution.

Enquanto isso: o alerta existe e fica registrado, mas **chega até você só se
você for olhar**. Não trate como notificação.
