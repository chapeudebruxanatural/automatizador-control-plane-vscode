# Brain — índice

Memória operacional do Control Plane. Deliberadamente enxuta: aqui fica o que
**não** se descobre lendo código ou rodando um comando. Fato consultável mora no
inventário; contexto e critério moram aqui.

## Mapa

| Arquivo | Responde a |
|---|---|
| [company.md](company.md) | Quem é a AutomatizadorIA, como opera, quais são as fronteiras |
| [infrastructure/vps.md](infrastructure/vps.md) | O que roda na VPS e o que isso significa |
| [integrations/panorama.md](integrations/panorama.md) | Estado real de cada integração externa |
| [operations/protocolo-de-aprovacao.md](operations/protocolo-de-aprovacao.md) | Quem aprova o quê, e como |

## Onde está cada tipo de informação

| Tipo | Lugar | Natureza |
|---|---|---|
| Fato sobre um recurso | `inventory/*.yaml` | Estruturado, regenerável |
| Contexto de um cliente | `clients/<slug>/profile.yaml` | Estruturado, curado |
| Levantamento bruto sanitizado | `docs/discovery/` | Narrativo, datado |
| Decisão com alternativas | `docs/adr/` | Imutável após aceita |
| Decisão corrente | `DECISIONS.md` | Cronológico |
| Procedimento passo a passo | `docs/runbooks/` | Executável por humano |
| Critério e julgamento | `brain/` | Narrativo, revisável |

## Regra de ouro

Todo dado carrega `verificationStatus` e `lastVerifiedAt`. Inferência não vira
fato por repetição. Ver [ADR 0003](../docs/adr/0003-procedencia-do-inventario.md).

Quando um documento do `brain/` conflitar com um inventário, **o inventário
vence** — ele é regenerado a partir da fonte, o `brain` é escrito à mão.
