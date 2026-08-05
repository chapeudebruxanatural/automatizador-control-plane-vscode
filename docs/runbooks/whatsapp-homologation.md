# Runbook — homologação do módulo WhatsApp

Data: 2026-08-05 · **Nenhum número real foi conectado. Nenhuma mensagem foi
enviada.**

## Estado atual

| Item | Estado |
|---|---|
| Adaptador | mock (`createMockEvolutionAdapter`) |
| `writeActionsEnabled` | `false`, fixo no código |
| Número conectado | nenhum |
| Allowlist configurada | nenhuma (vazia = nega tudo) |
| Ação `whatsapp.message.send` | registrada, sempre recusada pelo kill switch |
| **Payload real verificado** | **não** (`REAL_PAYLOAD_VERIFIED = false`) |

## ⚠️ Duas limitações que impedem conectar número real hoje

### 1. O formato do payload veio da documentação, não de amostra real

`packages/integrations/src/evolution/normalize.ts` interpreta o formato da
Evolution API v2 (Baileys): `event`, `data.key.remoteJid`, `data.key.fromMe`,
`data.key.id`, `data.message.conversation` /
`data.message.extendedTextMessage.text`.

Isso veio da documentação. **Nenhuma amostra foi capturada da instância que
roda na VPS** — fazê-lo exigiria ler tráfego de conversa, fora de escopo.

Antes de conectar: capture um evento real sanitizado, compare com
`tests/whatsapp/fixtures/evolution-payloads.ts`, e só então mude
`REAL_PAYLOAD_VERIFIED` para `true`.

### 2. `x-webhook-signature` é convenção deste projeto, não da Evolution

A Evolution API v2 **não assina o corpo do webhook com HMAC**. Ela envia a
própria `apikey` dentro do payload — mecanismo mais fraco, porque o segredo
trafega no corpo e vaza em qualquer log de requisição.

Para a verificação de assinatura funcionar com a instância real, uma destas
precisa ser resolvida primeiro:

| Opção | Custo | Força |
|---|---|---|
| Proxy reverso à frente calcula o HMAC e injeta o header | médio | forte |
| Validar o campo `apikey` do corpo em vez do header | baixo | fraca |
| Atualizar a Evolution para versão com assinatura nativa | alto | forte |

**Enquanto isso não for decidido, esta rota não deve receber tráfego de uma
instância real.** Ela funciona para homologação controlada, onde quem chama é
você mesmo com o segredo combinado.

## Antes de homologar com credencial real

1. Confirmar com o dono os **números autorizados** (allowlist) — apenas
   operadores internos nesta fase, nunca número de cliente
2. Gerar um segredo de webhook dedicado na Evolution API (`EVOLUTION_WEBHOOK_SECRET`)
3. Configurar `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` no `.env` local —
   **nunca colar no chat**
4. Trocar `createMockEvolutionAdapter()` por `createHttpEvolutionAdapter(...)`
   na montagem do módulo (ainda com `sendMessage` bloqueado — isso não muda)

## Testando localmente

```bash
npm test -- tests/whatsapp
```

Cobre: máscara de número, allowlist, rate limit, deduplicação, verificação de
assinatura (válida, inválida, ausente), todos os 10 comandos de consulta, e a
garantia de que `sendMessage` sempre rejeita.

## Simulando um webhook

O corpo precisa estar no **formato da Evolution API**, não no formato
simplificado. Com o servidor local rodando (`npm run dev`):

```bash
node -e "
const crypto = require('crypto');
const secret = 'segredo-de-teste-local'; // pragma: allowlist-secret
const body = JSON.stringify({
  event: 'messages.upsert',
  instance: 'homologacao',
  data: {
    key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'MSGID001' },
    message: { conversation: 'ajuda' }
  }
});
console.log('sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex'));
console.log(body);
"
```

```bash
curl -s -X POST http://localhost:3000/whatsapp/webhook \
  -H "content-type: application/json" \
  -H "x-webhook-signature: sha256=<valor-calculado-acima>" \
  -d '<mesmo-body-usado-acima>'
```

Esperado: `200` com `responsePreview` contendo a lista de comandos.

**Número não está na allowlist por padrão** — sem configurar
`allowedNumbers`, toda requisição passa na assinatura mas falha silenciosamente
na allowlist (por desenho: não revelar que o número está bloqueado versus
inexistente).

## Checklist antes de conectar um número real

Nenhum destes foi feito ainda:

- [ ] **Capturar um evento real sanitizado e confirmar o formato do payload**
      (então mudar `REAL_PAYLOAD_VERIFIED` para `true`)
- [ ] **Resolver a questão da assinatura** (proxy com HMAC, ou validar `apikey`
      do corpo, ou Evolution com assinatura nativa)
- [ ] Allowlist definida com números confirmados pelo dono
- [ ] Segredo de webhook gerado e configurado, nunca versionado
- [ ] Testes de `tests/whatsapp` passando
- [ ] `docker service logs` da Evolution API revisado por período razoável
      (sem erro recorrente)
- [ ] `ClientDirectoryProvider` real implementado, se os comandos de listagem
      forem necessários de verdade (hoje devolvem "nenhum registro
      disponível" honestamente)
- [ ] Aprovação explícita do dono para conectar instância real

Os dois primeiros são bloqueadores técnicos; os demais são preparação.

## Eventos que o módulo descarta (e por quê)

A Evolution emite muito mais que mensagem nova. Todos os casos abaixo
respondem **200**, não 4xx — são tráfego normal, e um 4xx faria a Evolution
reenfileirar indefinidamente algo que nunca será aceito.

| Motivo | Quando acontece | Por que descartar |
|---|---|---|
| `from_self` | eco de mensagem que o próprio número enviou | **prevenção de loop** — sem isso, um bot que responde entra em laço infinito assim que o envio for habilitado |
| `group_message` | mensagem em grupo (`@g.us`) | comando administrativo não opera em grupo, e grupo tem participante fora da allowlist |
| `broadcast_or_status` | status/stories | não é conversa dirigida |
| `no_text_content` | mídia sem texto, reação, edição | não há comando a interpretar |
| `not_a_message_event` | `connection.update`, `messages.update`, etc. | não carrega mensagem nova |
| `malformed` | estrutura inesperada, ou mensagem sem `id` | sem `id` estável não há deduplicação possível |

## Se algo der errado em homologação

1. O módulo não tem efeito colateral externo possível — `sendMessage` sempre
   rejeita. O pior cenário é resposta incorreta a um comando de consulta.
2. Revisar logs: toda linha usa `maskedFrom`, nunca o número completo
3. Se a assinatura estiver sendo rejeitada sem motivo aparente, confirmar que
   o segredo configurado no `.env` local é **o mesmo** configurado na
   Evolution API — são dois lugares independentes

## Passo seguinte, quando aprovado

Conectar uma instância de **teste** (número descartável, não o WhatsApp real
de nenhum cliente) antes de cogitar qualquer instância de produção. Isso está
fora do escopo desta fase.
