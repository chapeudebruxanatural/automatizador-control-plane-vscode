# ADR 0002 — Kill switch ligado por padrão

- **Status:** aceito
- **Data:** 2026-08-04

## Contexto

O Control Plane foi desenhado para agir sobre: uma VPS com serviços de produção,
instâncias de n8n que orquestram processos de clientes, DNS e proxy na Cloudflare,
contas Google com e-mail e arquivos reais, e contas de anúncios da Meta com verba
real em reais.

Boa parte da operação será conduzida por agentes de IA. Agentes erram de um jeito
particular: com confiança, rápido, e em lote. Um laço mal condicionado que pausa
campanhas ou reinicia containers não pede confirmação antes do décimo item.

A assimetria é grande. O custo de uma leitura desnecessária é alguns milissegundos.
O custo de uma escrita errada pode ser um cliente fora do ar ou verba queimada.

## Decisão

O sistema sobe com `CONTROL_PLANE_KILL_SWITCH=true` e `EXECUTION_MODE=dry-run`.

Nesse estado, toda ação classificada como **mutante** é recusada **na camada de
domínio**, antes de chegar ao adaptador. A recusa é registrada na auditoria como
evento, não como erro silencioso.

A verificação acontece no domínio de propósito. Se ficasse no adaptador, cada
nova integração teria que lembrar de implementá-la — e uma esqueceria.

Desligar o kill switch exige, simultaneamente:

1. `CONTROL_PLANE_KILL_SWITCH=false` no ambiente;
2. `EXECUTION_MODE=live`;
3. aprovação humana explícita quando `REQUIRE_HUMAN_APPROVAL=true`;
4. registro da justificativa e da janela de tempo em `DECISIONS.md`.

Quatro condições independentes. Nenhum descuido isolado libera escrita.

## Alternativas consideradas

**Kill switch desligado, com confirmação por ação.** Rejeitada. Depende de quem
está no teclado dizer "não" no momento certo, repetidamente. Falha por fadiga.

**Permissões separadas por integração, sem chave mestra.** Rejeitada como
mecanismo único — é granular demais para servir de freio de emergência. Quando
algo dá errado, é preciso um único ponto que pare tudo. As duas coisas são
complementares: a granularidade vem depois, por cima do kill switch.

**Ambiente de teste espelhado.** Desejável, mas não substitui o kill switch, e
hoje é inviável (ver [ADR 0001](0001-sem-docker-local.md)).

## Consequências

**Positivas.** O estado inseguro exige intenção deliberada. O padrão protege
inclusive contra o operador distraído e contra o agente confiante. A auditoria
registra tentativas bloqueadas, o que revela cedo qualquer automação querendo
escrever antes da hora.

**Negativas.** Fricção real. Toda operação legítima de escrita custa passos
extras, e a tentação de deixar o kill switch desligado "só hoje" vai existir.

**Mitigação.** Desligamento com janela de tempo declarada, e verificação em
`STATUS.md` a cada revisão. Se o kill switch estiver desligado sem justificativa
correspondente, isso é um achado.

## Verificação

Coberto por testes em `tests/kill-switch.test.ts`: ação mutante é recusada com
kill switch ligado; ação de leitura passa; a recusa produz evento de auditoria.
