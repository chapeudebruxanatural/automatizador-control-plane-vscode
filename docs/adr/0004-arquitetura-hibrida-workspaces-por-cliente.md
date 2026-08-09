# ADR 0004 — arquitetura híbrida com workspace privado por cliente

- **Estado:** aceita
- **Data:** 2026-08-09

## Contexto

O control plane concentra políticas e integrações compartilhadas, mas também
virou o único lugar onde uma IA encontra a memória dos clientes. Isso melhora a
segurança da execução e piora a continuidade cotidiana: cada troca entre
ChatGPT, Codex, Claude e Copilot depende de uma conversa longa ou de carregar
contexto de clientes que não participam da tarefa.

Existem ainda repositórios de site públicos. Copiar memória operacional para
eles vazaria campanha, funil e decisões comerciais. Repositório de código e
workspace operacional não são automaticamente a mesma coisa.

## Decisão

Adotar três camadas:

1. `automatizador-control-plane` continua como motor privado compartilhado:
   integrações, IDs autorizados, kill switch, aprovação, auditoria e execução;
2. cada cliente ganha um repositório operacional **privado**, com memória,
   decisões, tarefas, relatórios e referências verificadas daquele slug;
3. ChatGPT Projects, Claude, Codex, Copilot ou outra IA são interfaces
   substituíveis que leem os mesmos arquivos versionados.

Os workspaces usam o padrão `dadocruz/cliente-<slug>-ops`. Esse nome é intenção,
não descoberta: `actualRepository` permanece `null` e
`verificationStatus: unknown` até o repositório ser realmente criado e
conferido.

## Fronteiras de autoridade

| Informação | Fonte autoritativa |
|---|---|
| Integrações, credenciais e execução | control plane |
| Allowlist e associação que autoriza escrita | control plane |
| Memória comercial, tarefas e relatórios do cliente | workspace do cliente |
| Código do site/aplicação | repositório de código já existente |
| Conversa de uma IA | nunca é fonte autoritativa |

Durante a migração, `clients/<slug>/` continua sendo a fonte revisável. Um
workspace só passa a ser fonte operacional depois de: repositório privado
confirmado, revisão humana do `CLIENTE.yaml` e registro do vínculo no
inventário central.

## Portabilidade entre IAs

Cada workspace contém:

- `CONTINUAR-AQUI.md`, ponto de entrada comum;
- `AGENTS.md`, `CLAUDE.md` e `.github/copilot-instructions.md`;
- `CLIENTE.yaml`, com slug, procedência e origem da projeção;
- `HANDOFF.md`, `DECISIONS.md` e `TASKS.md`;
- `context/`, cópia allowlisted da memória já versionada.

Trocar de IA passa a significar abrir o mesmo repositório e ler o ponto de
entrada, não reconstruir contexto a partir de outro chat.

## Segurança

- workspace é privado por padrão;
- segredo não é copiado nem versionado;
- `security.yaml` é excluído por lista positiva e por regra explícita;
- destino não vazio é recusado para não sobrescrever trabalho;
- associação incerta permanece `unknown`;
- ação externa continua passando pelo control plane.

## Consequências

Há mais repositórios, mas menos mistura de contexto e menos dependência de uma
assinatura de IA. O custo de sincronização é aceito; será automatizado somente
depois do piloto do Cássio provar o fluxo. Repositórios públicos existentes não
recebem memória operacional.
