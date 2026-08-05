# ADR 0001 — Desenvolver sem Docker local

- **Status:** aceito
- **Data:** 2026-08-04

## Contexto

O diagnóstico do ambiente encontrou Node.js v24.14.0, npm 11.9.0, Git, `gh` CLI e
OpenSSH funcionando no Mac de desenvolvimento — mas **nenhum runtime de
container**: sem Docker Desktop, sem `~/.docker`, sem Colima e sem Podman.

A VPS (`nvvps`), por outro lado, roda Docker 28.5.1 e Docker Compose v2.40.3, e é
onde os serviços de produção vivem.

Havia três caminhos: instalar Docker no Mac, usar a VPS como ambiente de
desenvolvimento, ou construir a fundação sem depender de container.

## Decisão

Construir a fundação **sem nenhuma dependência de container local**. A aplicação
roda com `npm install` e `npm run dev`, e nada mais.

Consequentemente, nesta fase o Control Plane não integra banco de dados, fila nem
qualquer serviço que normalmente subiria via Compose.

## Alternativas consideradas

**Instalar Docker Desktop no Mac.** Rejeitada por ora. Custa tempo de download e
configuração, exige licenciamento em uso comercial, e não desbloqueia nada do que
esta fase precisa entregar. A instrução do dono foi explícita: não gastar tempo
nisso agora.

**Usar a VPS como ambiente de desenvolvimento.** Rejeitada. A VPS hospeda
produção e ainda não tinha inventário. Transformá-la em bancada de trabalho antes
de saber o que roda lá é exatamente o risco que este projeto existe para reduzir.

## Consequências

**Positivas.** O ciclo de desenvolvimento fica rápido e sem estado compartilhado.
A ausência de banco força as decisões de domínio a ficarem independentes de
infraestrutura, o que é bom desenho de qualquer forma. Zero risco à produção.

**Negativas.** Não há paridade entre desenvolvimento e produção. Quando o Control
Plane precisar de persistência real, essa lacuna vira problema — o código pode
funcionar local e falhar na VPS por diferença de ambiente.

**Mitigação.** A camada de persistência entra atrás de uma porta (`AuditProvider`,
e futuramente um repositório), de modo que trocar memória por banco seja uma
mudança de adaptador, não de domínio.

## Quando revisar

Assim que qualquer uma destas for verdade:

- o Control Plane precisar de PostgreSQL, Redis ou fila para funcionar;
- houver necessidade de reproduzir localmente um bug específico da VPS;
- o projeto passar a ser mantido por mais de uma pessoa.
