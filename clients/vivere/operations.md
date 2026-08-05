# Vivere — operação

Data: 2026-08-05 · Nenhuma ação no repositório ou nos ambientes deste cliente.

## Quem opera

**Responsável pelo lado do cliente:** Tiago Facanali. O organograma exato (é o
decisor final, ou o operador técnico do dia a dia?) não foi esclarecido —
registrado como pergunta aberta em `profile.yaml`.

## Onde o trabalho acontece

- **Repositório:** `dadocruz/vivere`, branch de trabalho
  `feat/substituicao-omie-completa-v1`
- **Ambientes:** produção (`gestao.viveremp.com`) e homologação
  (`vivere-homologacao.estudionovacena.workers.dev`)
- **Banco:** Supabase (projeto `wuaavhtwtidkdxxexzug`), fora da VPS e fora do
  perímetro deste Control Plane

## Ritmo de trabalho observado

Os últimos 5 commits da branch de trabalho mostram uma sequência de RH/ponto
concentrada e recente:

```
9c94469 feat(rh): casar funcionario pelo registro do AFD e ler folha manual por foto (IA)
ecb65e0 feat(rh): revincular funcionario ao AFD ja importado sem reenviar o arquivo
7ad842a feat(rh): relatorio separado de horas para funcionarios sem registro no contador
c607070 feat(rh): fechamento de ponto com AFD do relogio + folha manual + planilha do contador
996b429 docs(auditoria): registrar correcao do Pagar hoje e novo card Saldo em Contas
```

Isso é evidência de um módulo em desenvolvimento ativo e iterativo — não um
recurso pontual. O padrão de mensagem (`feat(rh): ...`) sugere disciplina de
commit por escopo, o que ajuda a reconstruir histórico depois.

## Como pedir ajuda ou aprovação

Este Control Plane **não opera** o repositório do Vivere. Ele **lê e
documenta**. Qualquer mudança real acontece no repositório do cliente, pelo
canal de trabalho já existente entre o dono e Tiago Facanali.

Se uma automação futura precisar tocar este cliente, ela segue o
[protocolo de aprovação](../../brain/operations/protocolo-de-aprovacao.md) —
Nível 2 no mínimo, por se tratar de repositório de cliente com dados
financeiros e de folha de pagamento.

## O que este Control Plane sabe e não sabe

**Sabe:** estrutura de módulos, branch e SHA atuais, dependências declaradas,
integrações existentes (Omie, Promob, AC Ponto), o incidente de segurança
pendente.

**Não sabe:** conteúdo de nenhum arquivo além de nomes e estrutura, se os
ambientes estão de fato no ar, credenciais de qualquer integração, processo de
aprovação de deploy do lado do cliente.

## Próximos passos operacionais

1. Confirmar o papel de Tiago Facanali no processo de aprovação
2. Verificar se `gestao.viveremp.com` reflete `main` ou a branch de trabalho
3. Resolver o incidente do TOTP (ver `security.yaml`)
4. Definir se e como este Control Plane deveria monitorar (só leitura) a saúde
   deste cliente no futuro
