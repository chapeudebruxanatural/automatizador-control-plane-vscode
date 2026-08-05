# Cássio Ferraz — estratégia v2

- **Publicada:** 2026-07-28
- **Status:** `partially_executed` — publicada **parcialmente**
- **Origem:** relato do proprietário em 2026-08-05
- **Alterações feitas por este documento:** nenhuma

> Registro de uma estratégia histórica. O que dela está no ar exige verificação
> na plataforma. Não trate nada aqui como estado atual.

## Desenho

Duas frentes com papéis distintos:

| Campanha | Canal | Escopo | Papel |
|---|---|---|---|
| `24073903393` | Pesquisa | regional | Captura de demanda existente |
| `24066140634` | Demand Gen | nacional | Geração de demanda — **prioritária** |

**Pesquisa regional** alcança quem já procura por show na região de atuação:
volume menor, intenção maior, custo por lead tipicamente melhor.

**Demand Gen nacional** alcança quem ainda não procura: volume maior, intenção
menor, e dependência forte de criativo. Ser a prioritária indica aposta em
expansão de mercado, não em colheita do que já existe.

A combinação é coerente. Essa leitura é da estrutura declarada, não uma
afirmação do proprietário.

## Mensuração declarada

A ambição vai além do lead:

```
clique → lead qualificado → proposta → fechamento → receita
```

Isso é a diferença entre otimizar por **volume de leads** e otimizar por
**dinheiro**. Um artista com poucos shows de alto valor precisa da segunda:
cem leads baratos que não fecham valem menos que três que contratam.

**Mas medir até receita exige importar conversão offline** do CRM de volta para
o Google Ads, e **não há confirmação de que isso esteja implementado**. Sem
esse retorno, a otimização enxerga apenas o lead e a estratégia opera cega da
metade do funil para baixo.

Ver [`crm-funnel.yaml`](crm-funnel.yaml).

## Conversões

| Conversão | Tipo |
|---|---|
| `CASSIO \| LEAD QUALIFICADO \| FORM` | primária |
| clique no WhatsApp | microconversão |

**Ponto de atenção.** Clique em WhatsApp é barato e frequente; lead qualificado
é caro e raro. Se as duas estiverem marcadas como primárias na plataforma, o
algoritmo otimiza para a barata — o painel mostra "conversões" subindo enquanto
o custo por lead real sobe junto.

Verificar ao vivo qual está marcada como primária é a checagem mais barata com
maior impacto potencial nesta conta.

## O que ficou pendente

O proprietário informou publicação **parcial**, sem detalhar o que faltou.
Candidatos, por ordem de probabilidade:

1. Import de conversão offline (proposta, fechamento, receita)
2. Ajuste de qual conversão é primária
3. Criativos da Demand Gen
4. Extensões e ativos da Pesquisa
5. Segmentação geográfica fina da Pesquisa

**Isso é hipótese.** Só a plataforma e o proprietário podem dizer.

## Bloqueio herdado

O [conflito de verba](financial-controls.yaml) impede evoluir a estratégia:
sem saber quanto há para gastar, não se decide lance, escala nem prioridade.

**Resolver o conflito vem antes de qualquer ajuste de mídia.**

## Verificação ao vivo necessária

- [ ] Status real das duas campanhas
- [ ] Qual conversão está marcada como primária
- [ ] Se o import de conversão offline existe
- [ ] O que da v2 está publicado e o que não está
- [ ] Volume e qualidade dos leads desde 28/07
- [ ] Gasto real contra os R$ 300 configurados

## Próximo passo

Ordem sugerida:

1. Resolver o conflito de verba
2. Verificar a configuração de conversões
3. Levantar o que da v2 está no ar
4. Só então propor v3

Nenhuma alteração de campanha pelo Control Plane — publicidade é
[Nível 2](../../docs/security/advertising-approval-policy.md), e não há
adaptador de Google Ads.
