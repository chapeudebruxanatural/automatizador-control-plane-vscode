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

Com o servidor local rodando (`npm run dev`), calcule a assinatura:

```bash
node -e "
const crypto = require('crypto');
const secret = 'segredo-de-teste-local'; // pragma: allowlist-secret
const body = JSON.stringify({ from: '5511999999999', text: 'ajuda', messageId: 'test-1' });
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

- [ ] Allowlist definida com números confirmados pelo dono
- [ ] Segredo de webhook gerado e configurado, nunca versionado
- [ ] Testes de `tests/whatsapp` passando
- [ ] `docker service logs` da Evolution API revisado por período razoável
      (sem erro recorrente)
- [ ] `ClientDirectoryProvider` real implementado, se os comandos de listagem
      forem necessários de verdade (hoje devolvem "nenhum registro
      disponível" honestamente)
- [ ] Aprovação explícita do dono para conectar instância real

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
