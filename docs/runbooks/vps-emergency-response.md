# Runbook — resposta a emergência na VPS

Para quando algo já está quebrado. Escrito para ser lido sob pressão: comandos
primeiro, explicação depois.

**Acesso:** `ssh nvvps` (root) · **Proxy:** Traefik nas portas 80/443 · **Nó único**

---

## Regra zero

**Diagnostique antes de reiniciar.** Um serviço reiniciado perde o estado que
explicaria a falha. Se você reiniciar primeiro, provavelmente vai reiniciar de
novo amanhã, sem saber por quê.

A exceção é o site fora do ar com causa óbvia e usuário esperando.

---

## Triagem — 60 segundos

```bash
ssh nvvps 'uptime; df -h /; free -h; docker ps -a --filter status=exited --filter status=restarting --format "{{.Names}}\t{{.Status}}"'
```

| Sintoma | Vá para |
|---|---|
| Disco > 90% | A — Disco cheio |
| Containers reiniciando | B — Container em loop |
| Tudo fora do ar | C — Traefik |
| Um site fora do ar | D — Serviço específico |
| Lentidão geral | E — Memória |
| Suspeita de invasão | F — Contenção |

---

## A — Disco cheio

```bash
ssh nvvps 'df -h /; du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head -5; du -sh /var/log/* 2>/dev/null | sort -rh | head -5'
```

Ordem de recuperação, do mais seguro ao menos:

1. **Logs.** `/var/log/novacena-*.log` não têm rotação configurada e já somam
   centenas de KB. Truncar é seguro: `: > /var/log/arquivo.log` (preserva o
   descritor aberto; `rm` não).
2. **Cache de build.** `docker builder prune -af` — só cache, sem risco de dado.
3. **Imagens sem tag.** Rode antes `scripts/docker-retention-dry-run.sh nvvps`
   e confira a lista. **Não** use `docker image prune -af` às cegas: pode
   remover a imagem de rollback.
4. **Nunca** `docker system prune --volumes`. Apaga dados de clientes.

---

## B — Container em loop de reinício

```bash
ssh nvvps 'docker ps -a --filter status=restarting --format "{{.Names}}\t{{.Image}}\t{{.Status}}"'
```

```bash
ssh nvvps 'docker service ps <servico> --no-trunc --format "{{.Name}}\t{{.CurrentState}}\t{{.Error}}"'
```

Logs — **sempre sanitizando**, porque logs de aplicação carregam token:

```bash
ssh nvvps 'docker service logs --tail 50 <servico> 2>&1' | sed -E 's/(gh[pousr]_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/[REDACTED]/g'
```

Causas prováveis, em ordem: banco indisponível → variável de ambiente ausente
após mudança → disco cheio → OOM (ver E).

---

## C — Traefik: tudo fora do ar

O Traefik é ponto único de entrada. Se ele cai, tudo cai — inclusive o
Portainer, que serviria para diagnosticar.

```bash
ssh nvvps 'docker service ps traefik_traefik --no-trunc --format "{{.CurrentState}}\t{{.Error}}"; ss -tulpn | grep -E ":80|:443"'
```

Se a porta não está escutando e o serviço está `Running`, o problema é a rede
`ingress` do Swarm. **Isso é Nível 2** e não tem receita curta: envolve
recriar a rede de ingresso, o que derruba todo o roteamento.

Antes disso, confirme que não é DNS ou Cloudflare — teste pelo IP direto.

---

## D — Um serviço específico fora do ar

Descubra qual serviço atende o domínio:

```bash
grep -A2 "Host(" docs/discovery/service-ownership.md | head -40
```

O mapa completo está em `docs/discovery/service-ownership.md`. Atalhos:
`estudionovacena.com/` → `novacena-motion` · `/editais` → `novacena-editais_web`
· `/music` → `novacena_music_nginx` (Swarm) · `/leonardo` → `novacena-propostas`
· `n8n.automatizadoria.cloud` → `n8n_n8n_editor`

```bash
ssh nvvps 'docker service ps <servico> --format "{{.CurrentState}}\t{{.Error}}"'
```

**Se for o `novacena-motion`:** o autodeploy roda a cada 2 minutos e faz
rollback sozinho quando o update falha. Espere 5 minutos antes de intervir —
provavelmente ele já está resolvendo.

```bash
ssh nvvps 'tail -20 /var/log/novacena-autodeploy.log'
```

---

## E — Memória

```bash
ssh nvvps 'free -h; docker stats --no-stream --format "{{.Name}}\t{{.MemPerc}}" | sort -k2 -rh | head -8; dmesg -T 2>/dev/null | grep -i "killed process" | tail -5'
```

**Não há swap.** Sob pressão o kernel mata processo em vez de desacelerar.
Consumidores conhecidos perto do limite: `chatwoot_app` (~56% de 1 GiB),
`typebot_builder` (~32%), `n8n_editor` (~26%).

Alívio imediato de ~75 MiB: desligar o `novacena-music` **Compose** (não o
Swarm — o Swarm é quem serve). Confirme em
`inventory/orphan-services.yaml` antes.

---

## F — Suspeita de comprometimento

**Não reinicie e não apague nada.** Reiniciar destrói evidência e pode acionar
persistência do atacante.

```bash
ssh nvvps 'last -20; ss -tunp | grep ESTAB | head -20; docker ps --format "{{.Names}}\t{{.Image}}" | grep -vE "n8n|chatwoot|typebot|evolution|traefik|portainer|minio|nocodb|postgres|pgvector|redis|nginx|novacena|encantaria"'
```

O terceiro comando lista containers que **não** pertencem ao inventário
conhecido. Qualquer coisa ali merece atenção imediata.

Se confirmado:

1. Isole pela rede (painel da Hostinger), não desligando a VPS
2. Rotacione tudo: chave SSH, tokens do GitHub, Cloudflare, n8n, Meta, S3
3. Preserve os logs antes de qualquer limpeza
4. Registre em `DECISIONS.md`

Portas `2377` e `7946` (gestão do Swarm) estão expostas em todas as interfaces —
é o vetor a investigar primeiro (R-003).

---

## Se precisar restaurar

Ver [`docs/runbooks/restore/README.md`](restore/README.md).

**Saiba de antemão:** hoje só o NovaCena Motion tem backup externo, e há
suspeita fundada de que ele arquiva o diretório errado (R-002). Os bancos
PostgreSQL — onde vivem os workflows e credenciais do n8n — **não têm backup**.

Em um cenário de perda total hoje, a recuperação seria parcial. Isso não é uma
falha deste runbook: é o estado da operação, e é o que o Bloco 1 do
[plano de estabilização](../operations/vps-stabilization-plan.md) resolve.

---

## Nunca, em nenhuma emergência

- `docker system prune --volumes` — apaga dados de clientes
- `rm -rf` em `/var/lib/docker/volumes`
- Restaurar sobre a base de produção sem renomear a atual antes
- Rodar `git reset --hard` em `/var/www/novacena-motion` (o autodeploy já faz)
- Alterar DNS ou Cloudflare para "testar"
- Reiniciar o Docker inteiro — derruba os 13 stacks de uma vez

## Depois

1. Registre em `DECISIONS.md`: o que houve, o que foi feito, o que resolveu
2. Atualize `STATUS.md` se o estado mudou
3. Se um risco conhecido se materializou, promova-o no plano de estabilização
