# Arquitetura — WhatsApp / Evolution API

Data: 2026-08-05 · **Módulo em homologação.** `writeActionsEnabled = false`,
fixo no código, sem flag de ambiente que o altere.

## O que já existe na VPS, fora deste Control Plane

Levantamento somente leitura em 2026-08-05, sem QR code, sem token, sem
conteúdo de conversa:

| Item | Valor |
|---|---|
| Serviço | `evolution_evolution_api` (stack `evolution`) |
| Imagem | `evoapicloud/evolution-api:latest` |
| Estado | `Up` há ~6 meses |
| Rota pública | `evo.automatizadoria.cloud` (via Traefik) |
| Fila | `evolution_evolution_redis` (redis, `DBSIZE` 0 no momento da leitura) |
| Volume de instâncias | `evolution_instances`, ~12 KB, **1 instância** (nome não lido) |
| Config de webhook no volume | não encontrada por nome de arquivo |

**Leitura correta desta descoberta:** a capacidade de WhatsApp já existe,
opera há meses, e está fora do controle deste Control Plane. Este módulo não
"cria" WhatsApp na operação — ele propõe um canal de **leitura supervisionada**
sobre uma capacidade que já existe e já é um risco latente, controlado ou não.

## Duas direções, dois níveis de maturidade

```
        Evolution API (VPS)
               │
     ┌─────────┴─────────┐
     ▼                   ▼
  ENTRADA              SAÍDA
  (webhook)           (envio)
     │                   │
     ▼                   ▼
processIncoming    executor.execute(
  (este módulo,      'whatsapp.message.send')
  homologação,       (ação já registrada em
  só consulta)        packages/domain/actions.ts,
                       SEMPRE recusada — kill
                       switch + adapter genérico
                       que rejeita por design)
```

**Entrada** é este módulo: recebe webhook, valida, responde a comandos de
consulta. **Saída** já existia desde o Ciclo 1 como ação registrada
(`whatsapp.message.send`), mutante, e portanto sempre bloqueada pelo kill
switch — este ciclo não muda essa parte.

## Cadeia de proteção da entrada

```
requisição HTTP
      │
      ▼
verifyWebhookSignature   ──✗──▶ 401, log sanitizado
   (HMAC, tempo constante)
      │ ✓
      ▼
JSON válido, campos obrigatórios ──✗──▶ 400
      │ ✓
      ▼
allowlist.isAllowed(from)   ──✗──▶ silêncio (não revela que existe)
      │ ✓
      ▼
deduplicator.isNew(messageId) ──✗──▶ ignorado (idempotência de webhook)
      │ ✓
      ▼
rateLimiter.check(from)    ──✗──▶ "aguarde um momento"
      │ ✓
      ▼
command-handler (switch fechado sobre 10 comandos)
      │
      ▼
CommandResponse (texto curto, sanitizado)
```

Seis portões antes de qualquer lógica de negócio rodar. Nenhum deles depende
de disciplina de quem escreve o próximo comando — são checagens estruturais.

### Por que a ordem importa

Assinatura **antes** de tudo: sem ela, um atacante nem precisa estar na
allowlist — está forjando o evento inteiro. Verificar allowlist antes de
verificar assinatura desperdiçaria trabalho validando payload de quem nem
deveria ter chegado.

Deduplicação **antes** de rate limit: um webhook duplicado pela própria
Evolution API (reenvio por timeout) não deveria consumir cota de rate limit de
um número legítimo.

## Por que `writeActionsEnabled` é `false` no código, não em config

Um `WHATSAPP_WRITE_ENABLED=true` no `.env` seria um interruptor barato demais
para a primeira vez que este canal manda mensagem para um cliente real. A
decisão de ligar escrita precisa custar uma mudança de código revisada — não
uma variável de ambiente que alguém marca `true` testando outra coisa.

```ts
export const WRITE_ACTIONS_ENABLED = false as const;
```

`sendMessage` no adaptador sempre rejeita, **independente** de `enabled` (que
controla apenas leitura). São dois interruptores diferentes por desenho: um
controla "consigo falar com a Evolution API", outro controla "posso mandar
mensagem" — e o segundo nunca fica `true` neste ciclo.

## Comandos aceitos (leitura apenas)

`status`, `status_vps`, `status_n8n`, `status_cloudflare`,
`listar_repositorios`, `listar_clientes`, `listar_projetos`,
`listar_riscos`, `listar_pendencias`, `ajuda`.

Cada um é um `case` fixo em `command-handler.ts` — não há interpolação de
string em comando de shell, não há `eval`, não há despacho dinâmico por nome.
Comando fora da lista cai no path de recusa.

Os 10 comandos de **escrita** do desenho original (`criar_repositorio`,
`fazer_deploy`, `enviar_mensagem_cliente`, etc.) estão nomeados em
`PROHIBITED_WRITE_COMMANDS`, sem handler — documentados como proibidos, não
apenas ausentes.

## Mascaramento de número

Todo log e toda auditoria usam `maskPhone()`. O número completo existe apenas
dentro do processamento da requisição corrente — nunca é serializado.

```
+5511987654321  →  +5511*****4321
```

## O que ainda não existe

- **`ClientDirectoryProvider` real.** Os comandos `listar_clientes`,
  `listar_projetos`, `listar_riscos`, `listar_pendencias` têm handler, mas a
  implementação real (lendo `clients/index.yaml` e os achados de
  `inventory/`) não foi construída — exigiria um parser de YAML, que não é
  dependência deste projeto. A implementação vazia devolve honestamente "nenhum
  registro disponível" em vez de fingir dado.
- **Envio de resposta de volta ao WhatsApp.** A rota do webhook responde no
  próprio corpo HTTP (para teste), não chama a Evolution API para entregar a
  mensagem ao usuário real.
- **Conexão com número real.** Ver
  [`docs/runbooks/whatsapp-homologation.md`](../runbooks/whatsapp-homologation.md).
