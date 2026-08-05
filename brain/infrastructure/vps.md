# VPS — o que importa saber

Dados completos: [`docs/discovery/vps-inventory.md`](../../docs/discovery/vps-inventory.md)
Estruturado: [`inventory/services.yaml`](../../inventory/services.yaml)

Aqui fica o julgamento sobre a infraestrutura, não o levantamento.

---

## Em uma frase

Uma VPS de 2 vCPU e 8 GB, com **Docker Swarm de nó único**, sustenta 13 stacks e
28 serviços — automação, atendimento, WhatsApp, chatbot, três PostgreSQL,
armazenamento de objetos e as aplicações de todos os clientes.

Tudo. Em um nó. Sem backup verificado.

## O que isso significa na prática

**Não existe isolamento entre clientes.** Um vazamento de memória em qualquer
serviço afeta todos os outros. Não há limite de recurso na maioria dos casos, e
não há swap: sob pressão, o kernel não desacelera — ele mata processo.

**Não existe rollback.** O cron roda `docker image prune -af` todo dia às 3h30.
Isso remove imagens tagueadas sem container ativo, o que inclui a versão
anterior de qualquer serviço. Se um deploy quebrar, a saída é reconstruir, não
voltar.

**Não existe plano de recuperação.** Os manifestos dos 13 stacks vivem em
`/root`, fora de qualquer repositório. Perder a VPS é perder a topologia junto
com os dados.

**Traefik é o ponto único de entrada.** Portas 80 e 443, sem Cloudflare Tunnel.
Se o Traefik cair, tudo cai — inclusive o painel que serviria para diagnosticar.

## O que está bem feito

Vale registrar, porque não é pouco:

- **n8n em modo fila.** Editor, worker e webhook separados, com Redis. É a
  configuração correta para produção, não a mais fácil.
- **Nada exposto além do necessário.** Só 80, 443 e 22 públicas. Bancos e
  serviços internos ficam na rede overlay.
- **Health checks funcionando** em `novacena-editais_web`, `novacena-motion` e
  `encantaria_database`.
- **Rede dedicada** para o stack `encantaria` (`encantaria_internal`), melhor
  isolada que o padrão.
- **Zero containers em erro** no momento da coleta.

Quem montou isso sabia o que estava fazendo. O problema não é a montagem — é a
ausência de rede de segurança em volta dela.

## As três coisas que mais importam

**1. Debian 11 acaba este mês.** O suporte LTS termina em agosto de 2026. Depois
disso, nenhuma correção de segurança para kernel, OpenSSH ou bibliotecas base.
Agravante: 193 dias sem reboot, então correções de kernel já aplicadas em disco
não estão em memória.

Migrar não é tarefa de improviso: 13 stacks dependem deste host.

**2. Backup não existe de verdade.** Dois diretórios pontuais em `/root/backups`,
de maio e julho, no mesmo disco que deveriam proteger. Três PostgreSQL, MinIO,
volumes de n8n, Chatwoot, Evolution e Typebot — nenhum com rotina verificada.

Backup no mesmo disco protege contra erro humano, não contra perda do host. E
backup nunca restaurado é hipótese, não garantia.

**3. `novacena-music` roda duplicado.** Os mesmos três componentes no ar por dois
caminhos: stack Swarm e projeto Compose. Dois volumes de nome quase idêntico,
duas redes.

O desperdício de ~75 MiB é o menor problema. O problema real é que **ninguém
sabe qual dos dois atende o tráfego** — e uma correção aplicada na cópia errada
parece simplesmente não funcionar.

## Como mexer aqui

1. **Leia antes.** `scripts/collect-vps-inventory.sh` recusa comando mutante.
   Use-o.
2. **Escrita é Nível 2** do [protocolo de aprovação](../operations/protocolo-de-aprovacao.md):
   aprovação explícita mais registro em `DECISIONS.md`.
3. **Sem backup, não mexa.** Enquanto o achado V-004 estiver aberto, qualquer
   alteração é irreversível na prática.
4. **Cuidado com o nome duplicado.** `novacena_music_*` e `novacena-music-*`
   diferem por um caractere e apontam para coisas diferentes.
5. **Nunca leia `.env`, `printenv` ou `docker inspect` completo.** Todos
   revelam credenciais e todos são bloqueados pelo coletor.

## Ordem sugerida de correção

| # | Ação | Por quê primeiro |
|---|---|---|
| 1 | Backup verificado, com destino externo e restauração testada | Sem isso, todo o resto é irreversível |
| 2 | Versionar os manifestos de `/root` (sem segredos) | Barato, e recupera a topologia |
| 3 | Resolver a duplicação do `novacena-music` | Devolve memória e remove ambiguidade |
| 4 | Restringir as portas 2377 e 7946 | Reduz superfície exposta |
| 5 | Trocar `prune -af` por poda seletiva | Devolve a possibilidade de rollback |
| 6 | Planejar a migração do Debian 11 | Maior, mas o relógio já está correndo |

O item 1 vem antes de todos porque muda a natureza dos outros: com backup
testado, um erro custa tempo. Sem ele, custa dados.
