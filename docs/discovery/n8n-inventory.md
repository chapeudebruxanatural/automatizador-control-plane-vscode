# Inventário do n8n — levantamento somente leitura

- **Data:** 2026-08-04
- **Método:** metadados de container e processo, via `nvvps`
- **Alterações realizadas:** **nenhuma**
- **Workflows executados:** **nenhum**

> Nenhuma credencial foi aberta. Nenhum webhook foi listado. Nenhum workflow foi
> lido, executado ou alterado. As lacunas abaixo são consequência dessa
> política, não de falta de tentativa.

---

## O que foi possível determinar

| Item | Valor | Procedência |
|---|---|---|
| Forma de instalação | Docker Swarm, stack `n8n` | verificado |
| Manifesto | `/root/n8n.yaml` | verificado |
| Imagem | `n8nio/n8n:latest` | verificado |
| Idade da imagem local | ~8 meses | verificado |
| Serviços | 4 (editor, worker, webhook, redis) | verificado |
| **Modo fila** | **sim** | verificado |
| Concorrência do worker | `--concurrency=10` | verificado |
| Estado | todos `running`, réplicas 1/1 | verificado |
| Uptime | ~6 meses | verificado |
| Porta interna | 5678 | verificado |
| Exposição direta | nenhuma — só via Traefik | verificado |
| Usuário do processo | `debian` (não root) | verificado |
| Diretório de dados | `/root/dados_vps/dados_n8n` | verificado |
| Volume Docker | apenas `n8n_redis` | verificado |
| Banco de dados | provavelmente o PostgreSQL 14 compartilhado | **inferido** |

### Arquitetura

```
            Traefik (443)
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
     editor   webhook   (interno)
        │        │
        └────┬───┘
             ▼
        Redis (fila)
             │
             ▼
     worker (concurrency=10)
             │
             ▼
      PostgreSQL 14  ← inferido
```

O modo fila é a configuração correta para produção: separa a interface de
edição, a recepção de webhooks e a execução. Um pico de webhooks não derruba o
editor, e a execução é retomável.

### Por que o banco é inferido

Não existe volume `n8n_data`. O único volume do stack é `n8n_redis`, que é a
fila. Como o n8n precisa persistir workflows, credenciais e histórico de
execuções em algum lugar, e há um PostgreSQL 14 compartilhado no host, a
hipótese é que ele use esse banco.

Isso **não foi confirmado** — confirmar exigiria ler variáveis de ambiente do
container ou conectar ao banco, e ambos estão bloqueados.

Se a hipótese estiver certa, a consequência é relevante: **as credenciais de
todas as integrações do n8n vivem no PostgreSQL compartilhado**, cifradas com
uma chave de criptografia que também é variável de ambiente. Perder o banco é
perder as automações; vazar o banco junto com a chave é vazar todas as
credenciais de todos os clientes.

---

## O que continua desconhecido

| Lacuna | Por que | Como destravar |
|---|---|---|
| Versão exata do n8n | Exigiria `docker inspect` ou `exec` | API key, ou aprovação de Nível 2 |
| URL pública | Está na configuração do Traefik | Ler rota do Traefik (Nível 1) |
| **Quantidade de workflows** | Exige API REST | **API key** |
| Quais workflows estão ativos | Exige API REST | **API key** |
| O que cada workflow faz | Exige API REST | **API key** |
| Quais clientes dependem de quais workflows | Exige API REST + curadoria | **API key** |
| Credenciais configuradas | Nunca serão inventariadas em valor | — |
| Erros recentes de execução | Exige API ou logs do container | API key |
| Rotina de backup dos workflows | Não há evidência de nenhuma | — |

---

## Bloqueio principal

**Não existe API key do n8n.** É o bloqueio de maior impacto do projeto inteiro.

Sem ela, o Control Plane não consegue responder a perguntas básicas:

- Quantos workflows existem?
- Quais estão ativos agora?
- Qual processo de qual cliente depende de qual workflow?
- Algum falhou recentemente?

Isso importa mais do que parece. O n8n roda há 6 meses e é o orquestrador de
fato da operação. Hoje, qualquer manutenção na VPS — atualizar o Debian,
reiniciar o PostgreSQL, mexer no Traefik — é feita sem saber o que vai parar.

Uma API key somente leitura resolve, custa alguns minutos e não muda nada em
produção.

**Como gerar:** interface do n8n → Settings → n8n API → Create an API key.
Guardar em `.env` local como `N8N_API_KEY`, nunca em arquivo versionado.

---

## Riscos

### N-001 · ALTO — Nenhuma documentação dos workflows fora do próprio n8n

Os processos dos clientes passam por workflows que só existem dentro da
ferramenta. Não há exportação versionada, não há descrição, não há mapa de
dependências.

Consequência imediata: manutenção de infraestrutura é feita às cegas.
Consequência de longo prazo: o conhecimento não é transferível.

### N-002 · ALTO — Sem backup dos workflows

Não há evidência de exportação automática. Perder o PostgreSQL — que também não
tem backup verificado (achado V-004) — significa perder todas as automações.

### N-003 · MÉDIO — Imagem `latest` com 8 meses

Usar a tag `latest` torna o comportamento de um `docker service update`
imprevisível: ele pode trazer 8 meses de mudanças de uma vez, incluindo
migrations de banco.

Nesse intervalo houve versões do n8n com correções de segurança. Vale fixar uma
versão explícita e atualizar deliberadamente.

### N-004 · MÉDIO — Credenciais concentradas em banco sem backup

Ver acima. Se a inferência do banco compartilhado estiver certa, todas as
credenciais de integração da operação estão em um PostgreSQL sem backup
verificado.

---

## Próximos passos

1. Gerar API key somente leitura no n8n *(desbloqueia tudo abaixo)*
2. Inventariar workflows: quantidade, estado ativo/inativo, data de modificação
3. Mapear workflow → cliente → processo de negócio
4. Estabelecer exportação periódica dos workflows para backup versionado
5. Fixar a versão da imagem em vez de `latest`
6. Confirmar qual banco o n8n usa de fato

Nenhum desses passos altera um workflow sequer. Todos são leitura ou
configuração de backup.
