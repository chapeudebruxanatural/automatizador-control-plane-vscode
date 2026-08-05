---
description: Atualiza o inventário somente-leitura da VPS sem alterar nada
---

Atualize o inventário da VPS `nvvps`.

**Restrição absoluta: somente leitura.** Antes de executar qualquer comando,
monte a lista completa e confirme que cada item é não-mutante. Se um comando
puder alterar estado, não execute.

Proibido: `restart`, `stop`, `rm`, `prune`, `install`, `update`, `exec` com
escrita, edição de arquivo, `migration`, alteração de firewall ou proxy.

Proibido expor: conteúdo de `.env`, saída de `printenv` ou `env`, variáveis de
ambiente de containers, `docker inspect` completo, `docker compose config` sem
filtro, webhooks com token.

Use sempre `ssh -o BatchMode=yes -o ConnectTimeout=15 nvvps '<comando>'`.

Colete: host, SO, uptime, CPU, memória, disco, versões de Docker e Compose,
containers com estado e saúde, imagens, redes, volumes (só nome e metadados),
projetos Compose, portas em escuta, serviços systemd, cron (só nomes e comandos
não sensíveis), proxy reverso, certificados (só domínio e validade), backups
(só caminho, data e tamanho), e containers em erro.

Atualize, com dados sanitizados:

- `docs/discovery/vps-inventory.md`
- `inventory/services.yaml`
- `inventory/containers.yaml`
- `inventory/databases.yaml`

Atualize `lastVerifiedAt` nos registros tocados. Ao final, relate o que mudou
desde o inventário anterior e confirme explicitamente: nenhuma alteração feita.
