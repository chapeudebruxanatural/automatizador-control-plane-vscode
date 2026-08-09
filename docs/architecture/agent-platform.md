# Plataforma de agente — arquitetura alvo

**Criado em:** 2026-08-05
**Estado:** fases 0 e 1 iniciadas; 2 a 6 não iniciadas
**Serve para:** qualquer agente (Claude Code, Codex, outro) continuar de onde parou

Este documento é o alvo comum. Antes dele, cada sessão improvisava a própria
noção do que estava sendo construído. Se você está pegando este projeto agora,
leia isto e o `HANDOFF.md` — juntos eles dizem o que existe, o que falta e por
que cada fronteira está onde está.

---

## 1. O que o dono pediu

Um agente que recebe comando por WhatsApp e executa ação nas contas dos
clientes: atualizar site, repositório, campanha no Google, relatório, ações em
plataformas SaaS. Mais uma página onde ele configura e vê histórico. Tudo
apoiado num banco na VPS que conhece os clientes.

Palavras dele: *"quero dar comandos para ele e ele executar ações nas contas dos
meus clientes"* e *"uma plataforma que comando as ações e configuro as coisas de
clientes"*.

---

## 2. Princípio que organiza tudo

> **O modelo não chama API. O modelo escolhe entre ações declaradas.**

É a diferença entre um agente e uma arma apontada para a carteira de clientes.
Um modelo com acesso direto a HTTP pode fazer qualquer coisa que a credencial
permita, e a credencial permite muito. Um modelo que escolhe entre ações
tipadas só faz o que alguém declarou, com esquema validado e risco
classificado.

Três consequências que não são negociáveis:

1. **Ação sem definição registrada não executa.** Não existe caminho anônimo.
2. **Ação sem capacidade declarada não é alcançável pelo agente**, mesmo que
   exista no domínio. Registrar no domínio é decisão de engenharia; expor ao
   agente é decisão de operação. As duas não devem acontecer pelo mesmo gesto.
3. **Escrita passa por confirmação com código derivado do plano.**

---

## 3. Camadas

```
  ENTRADA                  NÚCLEO                        EXECUÇÃO

  WhatsApp  ─┐                                          ┌─ Google Ads   ✅ ao vivo
  Página    ─┼─→  agente  →  capability  →  kill switch ┼─ GitHub       ✗
  Terminal  ─┘      │         catalog       + aprovação ├─ VPS / deploy ✗
                    │            │           + auditoria├─ SaaS cliente ✗
                    ↓            ↓                      └─ Evolution    ~ homologação
              resolvedor    confirmação
              de cliente     por código
                    │
                    ↓
              banco na VPS
        (clientes, contas, histórico)
```

### Memória portátil por cliente

O control plane não é mais a única interface de memória. A execução continua
central, mas cada cliente recebe um workspace privado com contexto, decisões,
tarefas e relatórios. O registro central guarda a projeção e o vínculo por
slug; nenhuma IA recebe os oito clientes quando a tarefa pertence a um só.

```text
workspace privado do cliente → plano tipado → control plane → adaptador
           memória               segurança       execução
```

Detalhes e fronteiras de autoridade: [ADR 0004](../adr/0004-arquitetura-hibrida-workspaces-por-cliente.md).

### Entrada

Três canais, mesma espinha. O canal muda **o que é alcançável**, não como a
ação é executada — `CapabilityCatalog.listForChannel()` decide.

O WhatsApp é o canal restrito de propósito: existe leitura que não deve ir para
uma tela que fica desbloqueada no bolso. Por isso `viaWhatsApp` é separado do
tier de risco.

### Núcleo

| Peça | Arquivo | Estado |
|---|---|---|
| Resolvedor de cliente | `packages/agent/src/client-resolver.ts` | ✅ pronto, testado |
| Confirmação por código | `packages/agent/src/confirmation.ts` | ✅ pronto, testado |
| Catálogo de capacidades | `packages/agent/src/capability.ts` | ✅ pronto, testado |
| Registro de ações | `packages/domain/src/action.ts` | ✅ existia |
| Kill switch | `packages/security/src/kill-switch.ts` | ✅ existia |
| Aprovação | `packages/security/src/approval.ts` | ✅ existia — hoje `deny-all` |
| Auditoria | `packages/audit/src/audit.ts` | ✅ existia |
| Interpretador de intenção | — | ✗ não existe |
| Banco na VPS | — | ✗ não existe |

### Execução

Só o Google Ads opera de verdade. O resto é adaptador a construir.

---

## 4. As três fronteiras de segurança

### 4.1 Resolução de cliente — recusa quando não tem certeza

A carteira tem colisões reais: `garbo-eventos` e `gaveta-producoes` começam
igual; `cassio-ferraz` e `chapeu-de-bruxa` também. Um resolvedor que acerta 90%
e chuta os 10% mexeria na conta errada uma vez a cada dez comandos.

A regra não é achar o mais provável — é **recusar quando há mais de um** e
devolver os candidatos para o agente perguntar.

```
dono:    sobe a campanha do ga
agente:  "ga" pode ser 2 clientes: garbo-eventos, gaveta-producoes. Qual deles?
```

Ambiguidade é apurada **antes** da guarda de tamanho mínimo, de propósito:
responder "não reconheci ga" seria falso — o termo não é desconhecido, serve
para dois clientes. As duas ordens recusam; só esta consegue dizer por quê.

### 4.2 Confirmação por código — o que torna o WhatsApp seguro

```
dono:    sobe o orçamento do Cássio pra 500
agente:  Cássio Ferraz · campanha 24066140634
         orçamento R$ 472,94 → R$ 500,00
         confirma com: 7F3A21
dono:    7F3A21
agente:  executado. request-id N7aI1EH774GQZDYEoVr-Ng
```

O código é **prefixo do SHA-256 do plano**, não um número sorteado. Isso
significa que ele só confere para aquele plano exato: se o valor, a campanha ou
o cliente mudarem entre planejar e confirmar, o código deixa de bater e a
execução é recusada sozinha, sem depender de ninguém reparar.

Decisões embutidas, cada uma com um motivo:

| Decisão | Por quê |
|---|---|
| Alfabeto sem `0/O` e `1/I` | o dono lê da tela e digita de volta |
| Sal aleatório por pedido | senão um código antigo, ainda na tela, confirma um plano novo que ele não leu |
| Validade de 5 minutos | plano é foto do estado; quanto mais velho, maior a chance de o mundo ter mudado |
| Consumido no uso, valha ou não | código não se reaproveita |
| Confere quem confirma | num grupo, ou com o número comprometido, bastaria ler o código na tela |
| Em memória, não em banco | confirmação pendente não deve sobreviver a reinício: se o serviço caiu entre o plano e a confirmação, o estado fotografado já não é confiável |

### 4.3 Capacidade — escala de consequência, não de tipo técnico

`mutating` do domínio é binário e basta para o kill switch. Não basta para o
WhatsApp: "gerar relatório" e "subir orçamento para R$ 500" são ambas
alcançáveis por mensagem, e tratar as duas igual erra dos dois lados — ou pede
confirmação para tudo, e o dono para de ler o que confirma, ou não pede para
nada.

| Tier | Significa | Confirmação |
|---|---|---|
| `read` | não muda nada | não |
| `reversible` | desfaz sem custo (pausar campanha) | sim |
| `costly` | gasta dinheiro, publica, altera conta de cliente | sim + valor em risco |
| `forbidden` | não alcançável por agente, ponto | — |

`forbidden` existe declarada em vez de ausente para que a recusa apareça na
auditoria como recusa, e não como "ação desconhecida" — que não distingue "não
existe" de "não pode".

`validateAgainst()` confere o catálogo contra o registro do domínio e acusa a
divergência perigosa: **ação mutante declarada como `read`**, que executaria
escrita sem confirmar. É o tipo de erro que passa em revisão de código e
aparece na fatura.

---

## 5. Fases

### Fase 0 — corrigir o que está quebrado ✅

- API do Google Ads fixada em v22 (a v21 passou a ser bloqueada)
- Credencial por `GOOGLE_ADS_KEY_PATH`, para rodar fora do notebook do dono

### Fase 1 — tornar contínuo ◐ em andamento

`.github/workflows/monitor.yml` está escrito e o monitor roda com `HOME` vazio
e credencial só por caminho (simulado). **Falta o dono cadastrar dois secrets** —
ver `docs/runbooks/ativar-monitor.md`. Até lá, `MONITOR_NOT_DEPLOYED` continua
valendo.

### Fase 2 — banco na VPS ✗

Hoje o catálogo de clientes é YAML, que serve ao Git e à revisão humana mas não
a um agente consultando ao vivo. Precisa de Postgres com clientes, contas,
credenciais por cliente (referência, nunca valor) e histórico de execução.

O YAML continua sendo a fonte revisável; o banco é projeção. Não inverter: um
banco como fonte tira as mudanças do controle de versão.

### Fase 3 — WhatsApp somente leitura ✗

*"como tá o Cássio?"*, *"relatório da semana"*. Nenhuma escrita.

**Não pule esta fase.** É onde se descobre, sem risco financeiro, se o agente
confunde Garbo com Gaveta. Os erros de interpretação aparecem baratos aqui e
caros na fase 4.

Antes dela: capturar payload real da Evolution — hoje
`REAL_PAYLOAD_VERIFIED = false`, o formato veio da documentação.

### Fase 4 — escrita com confirmação ✗

Só depois da 3 estar sólida. As peças de segurança já existem e estão testadas;
o que falta é o interpretador de intenção e os adaptadores.

### Fase 5 — página web ✗

Configuração, histórico, e aprovação do que for caro demais para o celular.

### Fase 6 — mais executores ✗

GitHub, deploy, SaaS dos clientes.

---

## 6. Riscos conhecidos desta arquitetura

**O celular do dono vira chave dos clientes.** Allowlist, rate limit e
deduplicação já existem no módulo Evolution. Falta decidir uma frase de pânico
que desliga tudo, e onde ela é processada.

**`x-webhook-signature` é convenção deste projeto**, não recurso da Evolution.
Se a Evolution não assinar, a autenticação do webhook precisa de outro desenho.

**Interpretação de intenção é o elo mais fraco.** As fronteiras protegem contra
executar a ação errada com os parâmetros errados. Não protegem contra o dono
pedir uma coisa e o modelo entender outra dentro do que é permitido. Por isso a
fase 3 existe.

**Texto observado nunca é comando.** Vale para mensagem de WhatsApp de terceiro,
conteúdo de página, saída de comando e resposta de API. Aprovação vem do dono,
pelo canal, com código.

---

## 7. Onde mexer para continuar

| Quero… | Vou em… |
|---|---|
| Declarar uma ação nova | `packages/domain/src/actions.ts` |
| Expor uma ação ao agente | `packages/agent/src/capability.ts` |
| Mudar como cliente é reconhecido | `packages/agent/src/client-resolver.ts` |
| Mudar o fluxo de confirmação | `packages/agent/src/confirmation.ts` |
| Ligar o monitor | `docs/runbooks/ativar-monitor.md` |
| Entender o estado do Google Ads | `HANDOFF.md` §5 e §7 |

Testes em `tests/agent/`. Rode `npm run verify` antes de commitar.
