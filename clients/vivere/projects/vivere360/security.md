# VIVERE 360 — segurança

Data: 2026-08-05 · Registro estruturado em [`../security.yaml`](../security.yaml).
Este documento é a leitura narrativa; o YAML é a fonte estruturada.

## O incidente

Um segredo TOTP (semente de configuração de autenticação multifator) da conta
`contato.automatizadoria@gmail.com` teria sido exposto em uma captura de tela
anterior, feita em algum momento do trabalho neste cliente.

**O escopo real é maior que o Vivere.** A conta exposta é a conta
administrativa **canônica da AutomatizadorIA** — não uma credencial do cliente
Vivere. Está registrada aqui porque foi relatada durante o handoff deste
projeto, mas o impacto potencial atinge toda a operação, não apenas este
cliente. Ver [`docs/security/access-matrix.md`](../../../../docs/security/access-matrix.md).

## O que foi feito

**Nada, deliberadamente.** Duas coisas foram evitadas por instrução explícita:

1. **O valor do TOTP não foi registrado em lugar nenhum**, nem parcial, nem
   mascarado. Não há forma de reconstruir o segredo a partir deste repositório.
2. **O fator MFA não foi revogado.** Revogar é ação com efeito colateral real:
   pode cortar acesso legítimo de quem depende dele, se feito sem coordenação
   com o dono. É decisão humana, não reflexo automático.

## Por que registrar sem agir é a decisão certa aqui

A alternativa — revogar imediatamente ao processar a menção do incidente —
pareceria mais segura à primeira vista, mas trocaria um risco por outro sem
consultar quem seria afetado. O [protocolo de aprovação](../../../../brain/operations/protocolo-de-aprovacao.md)
classifica isso como Nível 2: aprovação explícita **e** registro antes de agir.

O registro em si já produz valor: o incidente não se perde, fica rastreável, e
tem ação recomendada esperando decisão.

## Ação recomendada, quando o dono decidir agir

1. Confirmar se a captura de tela ainda existe e onde está armazenada
2. Se a exposição for confirmada, revogar o TOTP e reconfigurar o MFA da conta
3. Verificar o histórico de acesso de `contato.automatizadoria@gmail.com` por
   atividade incomum no período entre a exposição e a revogação
4. Registrar a resolução em [`DECISIONS.md`](../../../../DECISIONS.md)

## Outras observações de segurança do projeto

**Múltiplas integrações financeiras e de RH no mesmo projeto.** Omie
(financeiro/fiscal), AC Ponto (folha) e a nova leitura de folha manuscrita por
IA convivem no mesmo código. Um incidente de segurança que comprometa o
projeto tem superfície ampla — não é "só um site".

**Armazenamento de credenciais de integração não verificado.** Não foi
confirmado (nem tentado, por estar fora de escopo de leitura de código) onde
as credenciais de Omie, Promob e AC Ponto ficam guardadas dentro da aplicação.

**Múltiplos agentes de IA trabalharam no repositório.** Branches prefixadas
`codex/` e `claude/` existem ao lado da branch de trabalho atual. Isso não é
um problema em si, mas amplia a superfície de revisão: código passou por mais
de uma "mão" automatizada antes de chegar ao estado atual.

## Limite desta análise

Segurança de código (validação de entrada, controle de acesso, tratamento de
erro) não foi avaliada. Este documento cobre apenas o que foi relatado e o que
é observável por metadados — não é uma revisão de segurança do projeto.
