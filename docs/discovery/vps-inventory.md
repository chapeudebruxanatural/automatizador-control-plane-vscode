# Inventário da VPS — levantamento somente leitura

- **Data:** 2026-08-04
- **Alias de acesso:** `nvvps` (host `automatizadoria`)
- **Método:** `scripts/collect-vps-inventory.sh`, que recusa comandos mutantes
  em tempo de execução
- **Alterações realizadas:** **nenhuma**

> Este documento é sanitizado. Não contém IP, variáveis de ambiente, conteúdo de
> `.env`, credenciais, tokens ou webhooks. Nenhum `docker inspect` completo e
> nenhum `docker compose config` foi executado — ambos são bloqueados pelo
> guarda do coletor por poderem revelar segredos.

---

## 1. Host

| Item | Valor |
|---|---|
| Hostname | `automatizadoria` |
| Sistema | Debian GNU/Linux **11 (bullseye)** |
| Kernel | 5.10.0-37-cloud-amd64 |
| CPU | 2 vCPU — AMD EPYC 7543P |
| Memória | 7,8 GiB total · 5,6 GiB em uso · **1,7 GiB disponível** |
| Swap | **0 B** |
| Disco | 99 GB, 37 GB usados (39%) |
| Uptime | **193 dias** |
| Carga | 0,21 / 0,34 / 0,21 — folgada para 2 vCPU |

O gargalo é memória, não CPU. Com 1,7 GiB livres e **sem swap**, não há
amortecedor: um pico de consumo vira OOM kill, não lentidão.

## 2. Orquestração

**Docker Swarm**, nó único. Docker 28.5.1, Compose v2.40.3.

13 stacks, 28 serviços, ~32 containers em execução. Nenhum container em estado
de erro no momento da coleta.

| Stack | Serviços | Função |
|---|---|---|
| `traefik` | 1 | Proxy reverso e TLS — única porta de entrada (80/443) |
| `n8n` | 4 | Orquestração de automações, **em modo fila** |
| `chatwoot` | 3 | Atendimento (app, sidekiq, redis) |
| `evolution` | 2 | **API de WhatsApp** (Evolution API) + redis |
| `typebot` | 2 | Construtor e visualizador de chatbot |
| `postgres` | 1 | PostgreSQL 14 compartilhado |
| `pgvector` | 1 | PostgreSQL 16 com pgvector (embeddings) |
| `encantaria` | 2 | Directus 11 + PostgreSQL 16 |
| `novacena-editais` | 2 | Aplicação web + worker |
| `novacena_music` | 3 | Backend, frontend, nginx |
| `nocodb` | 1 | Banco no-code |
| `minio` | 1 | Armazenamento compatível com S3 |
| `portainer` | 2 | Painel de gestão de containers |

Fora de stack: `automatizadoria-site` e `novacena-propostas` (serviços avulsos,
ambos nginx estático) e `novacena-motion`.

## 3. Rede

| Porta | Escopo | Processo |
|---|---|---|
| 80, 443 | pública | docker-proxy → Traefik |
| 22 | pública | sshd |
| 8088 | **127.0.0.1** | docker-proxy → novacena-music-nginx |
| **2377** | **todas as interfaces** | dockerd — gestão do Swarm |
| **7946** | **todas as interfaces** | dockerd — descoberta de nós |
| 4789/udp | todas | dockerd — rede overlay (VXLAN) |

Não há `cloudflared` instalado: **não existe Cloudflare Tunnel**. O Traefik
recebe tráfego diretamente nas portas 80 e 443.

## 4. Certificados TLS

Não existe `/etc/letsencrypt`. Os certificados vivem no volume Docker
`volume_swarm_certificates`, gerenciados pelo Traefik. **Domínios e datas de
validade não puderam ser lidos** sem inspecionar o volume ou o container — o
que o guarda bloqueia. Fica como lacuna.

## 5. Serviço do host com falha

`nginx.service` está **failed desde 2026-06-20** (há ~1,5 mês). Está `disabled`,
e existe uma configuração `novacena-motion` em `/etc/nginx/sites-enabled/`.

Não há impacto observável: o tráfego entra pelo Traefik, e os nginx que
importam rodam em containers. É resíduo de uma topologia anterior — mas resíduo
que gera alarme falso em qualquer monitoramento que olhe `systemctl`.

## 6. Automação existente no cron do root

```
0  * * * *  docker exec <novacena-motion> npm run cleanup:transient
30 3 * * *  docker image prune -af
45 3 * * *  docker container prune -f
0  4 * * *  docker builder prune -af
15 4 * * *  apt-get clean
```

**Já existe automação destrutiva rodando diariamente.** O `docker image prune -af`
remove toda imagem sem container ativo, inclusive imagens *tagueadas* — o que
explica as entradas `<none>` na lista de imagens. Consequência prática: **não há
imagem anterior para rollback**. Se um deploy quebrar, a única saída é
reconstruir.

## 7. Runtimes no host

| Ferramenta | Versão |
|---|---|
| Node.js | v20.20.2 |
| npm | 10.8.2 |
| Python | 3.9.2 |
| PM2 | 7.0.1 (instalado, **sem processos**) |
| Git | 2.30.2 |
| psql / mysql / redis-cli | não instalados (só dentro dos containers) |
| caddy / traefik / cloudflared | não instalados no host |

## 8. Diretórios de aplicação

`/opt`: `automatizadoria-compliance-site`, `novacena-editais`, `novacena-music`,
`novacena-propostas`, `containerd`

`/root`: arquivos `*.yaml` de stack (chatwoot, evolution, minio, n8n, nocodb,
pgvector, portainer, postgres, traefik, typebot), `encantaria-cms`,
`novacena-motion`, `scripts/`, `backups/`, `dados_vps/`, e alguns arquivos de
diagnóstico datados de maio de 2026.

Os manifestos de stack estão em `/root`, versionados em lugar nenhum que
conheçamos. Se a VPS for perdida, a topologia se perde junto.

## 9. Backups

`/root/backups` contém **dois** diretórios:

- `automatizadoria-2026-07-13-2120`
- `novacena-motion-20260512-1826`

`/root/dados_vps` contém 10 diretórios `dados_*` (chatwoot, evolution, minio,
n8n, nocodb, pgvector, portainer, postgres, typebot, vps) — pela nomenclatura
são dados vivos ou cópias, não uma rotina de backup.

`/var/backups` tem apenas backups do próprio sistema APT (alternatives, dpkg).

**Não há evidência de rotina automatizada de backup, nem de cópia fora da VPS.**
Treze stacks, um nó, três bancos PostgreSQL — sem backup verificado.

---

## Achados

### V-001 · CRÍTICO — Debian 11 chega ao fim do suporte este mês

O sistema roda Debian 11 (bullseye). O suporte LTS do Debian 11 se encerra em
**agosto de 2026** — ou seja, agora. Depois disso não há mais atualização de
segurança, nem para o kernel, nem para OpenSSH, nem para as bibliotecas base.

Agrava: **193 dias sem reiniciar**. O `unattended-upgrades` está ativo, mas
atualização de kernel só passa a valer após reboot. O sistema provavelmente
carrega correções aplicadas em disco e não em memória.

**Ação:** planejar migração para Debian 12/13 com janela de manutenção. Não é
tarefa de improviso — 13 stacks dependem deste host.

### V-002 · ALTO — Portas de gestão do Swarm expostas em todas as interfaces

`2377` (gestão do cluster) e `7946` (descoberta) escutam em `*`. Em Swarm de nó
único, nenhuma das duas precisa ser alcançável de fora.

A porta 2377 é o plano de controle do cluster. Não confirmei se há firewall na
borda da Hostinger — se não houver, isso é superfície de ataque desnecessária.

**Ação:** verificar firewall externo e restringir ambas ao loopback ou à rede
privada.

### V-003 · ALTO — Arquivo com nome de backup de ambiente de produção em `/root`

Existe em `/root` um arquivo cujo nome indica ser cópia das variáveis de
ambiente de produção, datado de maio de 2026.

**O arquivo não foi aberto** — a política proíbe. Mas o nome basta para tratar o
conteúdo como comprometido em potencial: está em texto plano no home do root,
sem cifra e sem controle de acesso além do próprio root.

**Ação:** rotacionar as credenciais que ele provavelmente contém, e então
removê-lo. Rotacionar primeiro, apagar depois.

### V-004 · ALTO — Sem backup verificado

Ver seção 9. Três bancos PostgreSQL, um MinIO, volumes de n8n, Chatwoot,
Evolution e Typebot. Os dois snapshots existentes são pontuais e antigos
(maio e julho), locais, e no mesmo disco que estão protegendo.

**Ação:** definir rotina com destino externo e, principalmente, **testar a
restauração**. Backup não testado é hipótese, não garantia.

### V-005 · MÉDIO — `novacena-music` roda duas vezes

Os mesmos três componentes estão no ar por dois caminhos simultâneos:

| Origem | Containers |
|---|---|
| Stack Swarm `novacena_music` | `novacena_music_backend`, `_frontend`, `_nginx` |
| Compose em `/opt/novacena-music` | `novacena-music-backend-1`, `-frontend-1`, `-nginx-1` |

Há inclusive dois volumes quase homônimos (`novacena-music_novacena_music_data`
e `novacena_music_novacena_music_data`) e duas redes.

Custo direto: ~75 MiB de memória desperdiçados num host que tem 1,7 GiB livres.
Custo indireto, maior: **não se sabe qual dos dois atende o tráfego real**, e uma
alteração pode ser aplicada na cópia errada.

**Ação:** identificar qual atende o Traefik e desligar o outro. Requer aprovação
de Nível 2 — desligar o par errado tira o serviço do ar.

### V-006 · MÉDIO — Prune diário elimina a possibilidade de rollback

Ver seção 6. `docker image prune -af` remove imagens tagueadas sem container
ativo. Não existe imagem anterior guardada.

**Ação:** trocar `-a` por poda seletiva, ou manter um registry com as últimas N
imagens de cada serviço.

### V-007 · MÉDIO — Pressão de memória sem swap

5,6 GiB de 7,8 GiB em uso, sem swap. Vários containers operam perto do próprio
limite: `chatwoot_app` a 56% de 1 GiB, `typebot_builder` a 32%, `chatwoot_sidekiq`
a 28%, `n8n_editor` a 26%, `n8n_worker` a 23%.

Sem swap, o kernel não desacelera sob pressão — ele mata o processo.

**Ação:** resolver V-005 devolve ~75 MiB de graça. Depois, avaliar limites por
serviço ou aumentar a VPS.

### V-008 · MÉDIO — Container órfão fora de qualquer stack

`determined_neumann` roda `novacena-editais-tools:v2` há 2 semanas com nome
gerado automaticamente pelo Docker — sinal de `docker run` manual que ficou.
Consome 152 MiB. Não pertence a nenhum stack, então não é gerenciado, não
reinicia sozinho e ninguém o monitora.

**Ação:** descobrir o que faz. Se for tarefa pontual esquecida, encerrar.

### V-009 · MÉDIO — Manifestos de stack fora de versionamento

Os arquivos `*.yaml` que definem os 13 stacks vivem em `/root`. Não há
indicação de que estejam em nenhum repositório.

Perder a VPS significa perder a topologia inteira, e reconstruí-la de memória.

**Ação:** versionar os manifestos — **depois** de removê-los de qualquer
segredo embutido.

### V-010 · BAIXO — `nginx.service` do host falhado há 1,5 mês

Ver seção 5. Sem impacto funcional. Deve ser removido ou documentado como
inativo intencional, para não gerar alarme falso.

---

## Descobertas que corrigem o catálogo

**`encantaria_artesanal` não é commit acidental.** O inventário de repositórios
o classificou como provável engano de estrutura. A VPS mostra um stack
`encantaria` em produção há 6 semanas, com Directus 11 e PostgreSQL 16, e existe
`/root/encantaria-cms`. É um projeto real, com CMS e banco próprios. A entrada em
`inventory/repositories.yaml` precisa ser corrigida.

**`automatizadoria-compliance-site` está publicado.** Existe
`/opt/automatizadoria-compliance-site` e o serviço `automatizadoria-site`
(nginx) no ar há 11 dias. Reforça a associação com o cliente `automatizadoria`.

**Existem serviços sem repositório conhecido:** `novacena-editais` (web +
worker, com imagens próprias `novacena-editais:v3` e
`novacena-editais-tools:v2`) e `novacena-propostas`. Nenhum dos dois aparece em
`inventory/repositories.yaml`. Ou o código está em outro lugar, ou não está
versionado.

**A capacidade de WhatsApp já existe na VPS.** A Evolution API roda há 6 meses,
com volume `evolution_instances`. A decisão de manter o WhatsApp fora do escopo
do Control Plane continua válida — mas o risco não é hipotético: o canal já
está montado e operante, apenas fora do controle deste projeto.

---

## Lacunas deste levantamento

| Lacuna | Motivo |
|---|---|
| Versão exata do n8n | Exigiria `docker inspect` ou `exec`, ambos bloqueados |
| Domínios e validade dos certificados | Vivem em volume do Traefik |
| Mapeamento domínio → serviço | Exigiria ler a configuração do Traefik |
| Contagem de workflows do n8n | Exige API key |
| Tamanho dos bancos | Exigiria conexão ao PostgreSQL |
| Regras de firewall externo | Ficam no painel da Hostinger |

Nenhuma dessas lacunas justifica quebrar a política de somente leitura. Todas se
resolvem com uma credencial ou com uma aprovação específica.
