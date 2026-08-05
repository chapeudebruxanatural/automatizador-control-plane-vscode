# Próximos passos

Data: 2026-08-04 · Fila detalhada: [TASKS.md](../../TASKS.md)

Este documento responde a uma pergunta só: **o que fazer em seguida, e por quê
nessa ordem.**

---

## O que a fundação entregou

Repositório privado, proteção de segredos funcionando, inventário com
procedência explícita, e uma aplicação que roda sem Docker com kill switch
ligado. Nada disso executa ação externa — de propósito.

O valor real desta fase não foi o código. Foi descobrir o que existe.

---

## O que o inventário revelou

Três coisas mudaram a prioridade do que vem depois:

**A operação é maior do que o catálogo sugeria.** A VPS roda 13 stacks e 28
serviços. Existem aplicações em produção — `novacena-editais`,
`novacena-propostas` — **sem repositório conhecido**. E há um projeto ativo há
seis semanas (`encantaria`, com Directus e PostgreSQL) que não pertence a nenhum
cliente do catálogo.

**Não há rede de segurança.** Sem backup verificado, sem imagem para rollback
(o `prune -af` diário remove), sem manifesto versionado. Qualquer erro em
produção hoje é irreversível na prática.

**O relógio está correndo em duas frentes.** O Debian 11 encerra o suporte LTS
este mês, e o host está há 193 dias sem reiniciar.

---

## Ordem recomendada

### Bloco 1 — Parar de operar sem rede de segurança

Isso vem antes de qualquer automação nova. Enquanto não estiver feito, todo o
resto acumula risco.

| # | Ação | Nível | Por quê |
|---|---|:--:|---|
| 1 | Backup com destino externo **e restauração testada** | 2 | Transforma erro de "perda de dados" em "perda de tempo" |
| 2 | Versionar os manifestos de `/root` (sem segredos) | 2 | Barato; recupera a topologia se a VPS for perdida |
| 3 | Localizar o código de `novacena-editais` e `novacena-propostas` | 0 | Se não existir, hoje eles só vivem dentro de uma imagem Docker |
| 4 | Rotacionar o segredo do arquivo `/root` (achado V-003) | 2 | O arquivo não foi aberto, mas o nome basta para tratá-lo como comprometido |
| 5 | Rotacionar o token exposto na URL de aba do navegador | — | Credencial **já** exposta |

### Bloco 2 — Enxergar o que hoje é ponto cego

Custo baixíssimo, retorno alto. Duas credenciais de leitura destravam quase
todo o conhecimento que falta.

| # | Ação | Nível | Destrava |
|---|---|:--:|---|
| 6 | API key somente leitura do n8n | 1 | Quantos workflows existem, quais estão ativos, quem depende deles |
| 7 | Token somente leitura da Cloudflare | 1 | O mapa domínio → cliente, maior lacuna do catálogo |
| 8 | Resolver o conflito de contas do conector do Drive | 1 | Viola a regra de separação Google definida pelo dono |
| 9 | Triagem dos 5 repositórios sem cliente | 0 | Atribuir ou arquivar |

O item 6 é o de maior impacto isolado do projeto. Hoje, qualquer manutenção na
VPS é feita sem saber quais processos de clientes vão parar.

### Bloco 3 — Corrigir o que está torto

| # | Ação | Nível |
|---|---|:--:|
| 10 | Resolver a duplicação do `novacena-music` | 2 |
| 11 | Restringir as portas 2377 e 7946 do Swarm | 2 |
| 12 | Trocar `prune -af` por poda seletiva | 2 |
| 13 | Investigar e encerrar o container órfão `determined_neumann` | 2 |
| 14 | Remover ou documentar o `nginx.service` falhado | 1 |

### Bloco 4 — Adaptadores reais, sempre em leitura

Nessa ordem, e cada um com testes de contrato, atrás do kill switch:

Cloudflare → n8n → GitHub → VPS (com lista branca) → Google → Meta

### Bloco 5 — Planejamento maior

| Ação | Observação |
|---|---|
| Migrar do Debian 11 | Precisa de janela; 13 stacks dependem do host |
| CI no GitHub Actions | lint, typecheck, teste, build e varredura de segredos |
| Hook de pre-commit chamando `scan:secrets` | Hoje é manual |
| Auditoria em arquivo com rotação | Memória se perde no restart |
| Fluxo de aprovação com token de uso único e expiração | Hoje `deny-all` |

---

## O que **não** fazer agora

**WhatsApp.** É o único canal que fala direto com o cliente final; erro ali é
público e irreversível. Entra depois que auditoria e aprovação estiverem
exercitados em canais de menor consequência.

**Docker local.** Ver [ADR 0001](../adr/0001-sem-docker-local.md). Não desbloqueia nada agora.

**Qualquer escrita em produção** antes do Bloco 1. Sem backup testado, "desfazer"
não é uma opção disponível.

**Automatizar o n8n** antes de saber o que ele faz. Seria automatizar o
desconhecido, que é justamente o problema que este projeto existe para reduzir.

---

## O que depende só do dono

Estes itens ninguém mais pode fazer, e vários deles destravam o resto:

1. Gerar a API key do n8n
2. Emitir o token somente leitura da Cloudflare
3. Decidir sobre a conta do conector do Drive
4. Dizer a quem pertencem os 5 repositórios órfãos e o projeto `encantaria`
5. Confirmar se `soulraizes` e `chapeu-de-bruxa` estão ativos
6. Regularizar as 6 contas Meta restritas
7. Aprovar a janela de manutenção para backup e migração

O passo a passo para os itens 1 e 2 está em
[docs/runbooks/desbloquear-integracoes.md](../runbooks/desbloquear-integracoes.md).
