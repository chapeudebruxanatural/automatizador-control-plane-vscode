# Propriedade dos serviços — quem é dono do quê

- **Data:** 2026-08-05
- **Método:** regras de roteamento do Traefik (projeção fixa, apenas labels) +
  metadados de serviço e volume
- **Alterações:** **nenhuma**

As regras do Traefik são a fonte mais confiável de propriedade que existe hoje:
elas dizem qual domínio chega em qual serviço, e domínio é o que o cliente vê.

---

## Mapa completo domínio → serviço

### `automatizadoria.cloud` — plataforma interna

| Host | Serviço | Função |
|---|---|---|
| `automatizadoria.cloud`, `www.` | `automatizadoria-site` | Site institucional / conformidade |
| `n8n.automatizadoria.cloud` | `n8n_n8n_editor` | Editor de workflows |
| `webhook.automatizadoria.cloud/webhook` | `n8n_n8n_webhook` | Recepção de webhooks |
| `chatwoot.automatizadoria.cloud` | `chatwoot_chatwoot_app` | Atendimento |
| `evo.automatizadoria.cloud` | `evolution_evolution_api` | **Gateway de WhatsApp** |
| `tpb.automatizadoria.cloud` | `typebot_typebot_builder` | Construtor de chatbot |
| `bot.automatizadoria.cloud` | `typebot_typebot_viewer` | Chatbot publicado |
| `noco.automatizadoria.cloud` | `nocodb_nocodb` | Banco no-code |
| `minio.automatizadoria.cloud` | `minio_minio` | Console do MinIO |
| `s3.automatizadoria.cloud` | `minio_minio` | Endpoint S3 público |
| `portainer.automatizadoria.cloud` | `portainer_portainer` | Painel de containers |

**Onde está `automatizadoria.cloud`:** aponta para esta VPS, servido pelo
Traefik. Pergunta da Fase 5 respondida — pelo menos do lado do destino.

### `estudionovacena.com` — um domínio, quatro aplicações

O domínio é compartilhado por caminho, com `srv1106082.hstgr.cloud` (hostname
padrão da Hostinger) como alternativa em todas as regras:

| Caminho | Serviço | Cliente |
|---|---|---|
| `/` (raiz) | `novacena-motion` | novacena |
| `/editais` | `novacena-editais_web` | novacena |
| `/music` | `novacena_music_nginx` | novacena |
| `/leonardo` | `novacena-propostas` | novacena |

`/leonardo` esclarece o `novacena-propostas`: é uma **proposta comercial
publicada para um cliente específico**, não um produto.

### `encantariaartesanal.com`

| Host | Serviço |
|---|---|
| `painel.encantariaartesanal.com` | `encantaria_directus` |

Isso explica a **aparente segunda entrada** de `encantariaartesanal.com` na
Cloudflare mencionada pelo dono: provavelmente o subdomínio `painel.` aparecendo
como registro separado, não uma segunda zona. **Confirmar na Fase 5.**

---

## R-007 resolvido — qual `novacena-music` está no ar

**O Swarm está servindo. O Compose é o resíduo.** E isso contraria o que o
tamanho dos volumes sugeria.

| | Swarm `novacena_music` | Compose `/opt/novacena-music` |
|---|---|---|
| Roteador Traefik | **sim** (`/music`) | **nenhum** |
| Exposição | via Traefik | apenas `127.0.0.1:8088` |
| Volume de dados | 59 MB | **766 MB** |
| Imagens | tags `:local` | por SHA (sem tag) |
| No ar desde | 8 semanas | 8 semanas |

**A leitura.** O Compose tem 13× mais dados, mas não recebe tráfego nenhum. A
hipótese mais provável: o Compose foi a instalação original, acumulou dados, e o
stack Swarm foi criado depois — começando do zero e assumindo o roteamento.

**Consequência prática.** Desligar o Compose não derruba o site, mas deixa
**766 MB de dados órfãos** que ninguém está usando e ninguém sabe se importam.
A pergunta certa não é "posso desligar?", é "esses 766 MB fazem falta?".

**Recomendação.** Antes de desligar: inspecionar o conteúdo dos dois volumes e
decidir se há algo a migrar. Nível 2.

> Isso corrige a inferência que eu havia registrado em
> `inventory/containers.yaml`, que sugeria o Compose como provável ativo por ter
> mais dados. Volume maior não significa serviço ativo.

---

## Serviços sem repositório conhecido

### `novacena-editais` — em produção há 2 semanas

Web (`novacena-editais:v3`) + worker (`novacena-editais-tools:v2`), em
`/opt/novacena-editais`, servindo `estudionovacena.com/editais`.

Nenhum repositório do GitHub de `dadocruz` corresponde. Imagens com versão
explícita (`v3`, `v2`) indicam build deliberado e versionado — o que reforça que
existe código-fonte em algum lugar.

**Hipótese a testar:** o cliente `cassio-ferraz` tem um diretório `editais/` no
repositório. Pode haver relação temática (editais de incentivo cultural), mas
**são coisas diferentes**: um é site estático de artista, outro é aplicação com
worker. Não presumir.

### `novacena-propostas` — em produção há 5 semanas

`nginx:1.27-alpine` servindo estático de `/opt/novacena-propostas` em
`estudionovacena.com/leonardo`. Sem repositório conhecido.

Sendo estático, o conteúdo está no diretório do host — e **não está coberto por
backup** (ver `inventory/backups.yaml`).

### `determined_neumann` — container órfão

`novacena-editais-tools:v2`, 152 MB, 2 semanas, nome gerado automaticamente pelo
Docker. Fora de qualquer stack: não reinicia sozinho, não é monitorado.

Mesma imagem do worker do `novacena-editais`. Provável `docker run` manual para
uma tarefa pontual, que ficou.

---

## Ações

| # | Ação | Nível |
|---|---|---|
| 1 | Localizar o código de `novacena-editais` e versioná-lo | 0 |
| 2 | Localizar o conteúdo de `novacena-propostas` e versioná-lo | 0 |
| 3 | Incluir `/opt/novacena-*` no backup | 1 |
| 4 | Comparar os dois volumes do `novacena-music` antes de desligar o Compose | 1 |
| 5 | Descobrir o propósito de `determined_neumann` e encerrá-lo | 2 |
| 6 | Confirmar na Cloudflare se `painel.encantariaartesanal.com` é subdomínio ou zona | 1 |
