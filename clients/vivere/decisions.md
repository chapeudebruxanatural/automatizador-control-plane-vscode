# Vivere — decisões

Registro cronológico de decisões específicas deste cliente. Decisões gerais do
Control Plane ficam em [`DECISIONS.md`](../../DECISIONS.md).

---

## 2026-08-05 — Importar contexto do VIVERE 360 sem copiar o handoff privado

**Decisão.** Estruturar o conhecimento do projeto (módulos, integrações,
ambientes, pendências, incidente de segurança) em arquivos próprios deste
Control Plane, sem colar o documento de handoff original
(`docs/HANDOFF_CLAUDE_CODE_VIVERE360.md`, dentro do repositório `vivere`) na
íntegra em nenhum arquivo aqui.

**Motivo.** O handoff é um documento operacional do repositório do cliente,
escrito para quem já está no meio do trabalho técnico. Copiá-lo inteiro para
este repositório duplicaria conteúdo que já tem dono e lugar, e correria o
risco de arrastar junto algo sensível que não foi revisado para o contexto
deste Control Plane — que é lido por um público diferente (operação
AutomatizadorIA, não o time do Vivere).

**Consequência.** Os arquivos aqui são um **resumo estruturado com
procedência**, não uma cópia. Quem precisar do detalhe completo vai ao
repositório `dadocruz/vivere`.

---

## 2026-08-05 — Registrar o incidente do TOTP sem revogar o fator

**Decisão.** O incidente de exposição do segredo TOTP da conta
`contato.automatizadoria@gmail.com` foi registrado em
[`security.yaml`](security.yaml) com status `requires_live_verification`, sem
nenhuma ação de revogação.

**Motivo.** Revogar um fator de MFA é ação com efeito colateral real sobre
acesso a uma conta em uso ativo. Fazer isso como reflexo automático a uma
menção de incidente, sem confirmar com o dono se a exposição é real e sem
coordenar o momento, poderia bloquear acesso legítimo no meio de outra
atividade.

**Consequência.** O incidente fica visível e rastreável, com ação recomendada
registrada, aguardando decisão humana explícita (Nível 2).

---

## 2026-08-05 — Não presumir campanha de mídia para o Vivere

**Decisão.** `marketing-readiness.yaml` registra o status `campaign_not_ready`
e uma checklist de pré-requisitos, em vez de qualquer estrutura de campanha.

**Motivo.** O histórico de Google Ads informado pelo dono é explícito: "campanha
não pronta". Criar arquivos de campanha para um cliente sem campanha ativa
sugeriria prontidão que não existe.

**Consequência.** Antes de qualquer mídia paga para este cliente, a checklist
de `marketing-readiness.yaml` precisa estar resolvida.
