# CONTINUAR AQUI — {{CLIENT_NAME}}

Este é o ponto de entrada obrigatório para qualquer IA ou pessoa que assuma o
cliente `{{CLIENT_SLUG}}`.

## Ordem de leitura

1. `CLIENTE.yaml`
2. `HANDOFF.md`
3. `DECISIONS.md`
4. `TASKS.md`
5. arquivos necessários em `context/`

## Regras

- Este repositório trata somente de `{{CLIENT_SLUG}}`. Recurso de outro cliente
  é recusado, não reaproveitado.
- Associação incerta continua `verificationStatus: unknown`.
- Clique, microconversão, conversa, lead e contrato são métricas diferentes.
- Nenhum segredo entra em chat, commit, relatório ou log.
- Não altere campanha, orçamento, publicação, mensagem ou produção diretamente.
  Gere um plano e execute pelo control plane com a aprovação exigida.
- Antes de concluir ausência de dado, confira período, filtros e fonte.
- Ao terminar, atualize `HANDOFF.md`, `DECISIONS.md` quando houver decisão e
  `TASKS.md`.

## Fronteira com o control plane

Este workspace é a memória portátil do cliente. Integrações, credenciais,
allowlists, kill switch, aprovações e auditoria pertencem ao repositório
`dadocruz/automatizador-control-plane`.
