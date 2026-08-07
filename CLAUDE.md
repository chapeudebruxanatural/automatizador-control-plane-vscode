# CLAUDE.md

> **Está assumindo este projeto agora?** Leia **`CONTINUAR-AQUI.md`** primeiro.
> Ele separa o que é fato verificado do que é incerto, lista os erros já
> cometidos por inferência plausível, e traz a fila de trabalho em ordem.
> Este arquivo aqui traz as regras; aquele traz o estado.

## Idioma

Todas as respostas — no chat, em commits, em documentação e em qualquer saída
gerada — devem ser em português do Brasil. Código, nomes de identificadores e
termos técnicos sem tradução consagrada podem permanecer em inglês.

## Objetivo

Plano de controle privado da AutomatizadorIA. Centraliza inventário, contexto de
clientes e automação operacional sobre GitHub, VPS, n8n, Cloudflare, Google e
Meta. Opera com kill switch ligado por padrão: leitura livre, escrita sob aprovação.

## Comandos principais

```bash
npm install          # dependências
npm run dev          # API local em http://localhost:3000
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # testes
npm run build        # compila para dist/
npm run scan:secrets # varredura de segredos nos arquivos em stage
```

## Regras obrigatórias

1. Kill switch (`CONTROL_PLANE_KILL_SWITCH`) começa `true`. Nenhuma ação externa
   com efeito colateral roda sem desligamento explícito e aprovado.
2. Somente-leitura na VPS. Nunca reiniciar, parar, remover, instalar, atualizar
   ou fazer `prune`.
3. Nunca modificar repositórios de clientes, DNS, Cloudflare, bancos, n8n ou
   campanhas sem aprovação específica para aquela ação.
4. Nunca fazer `force push`. Nunca apagar recursos.
5. WhatsApp está desabilitado nesta fase.
6. Inferência não vira fato: use `verificationStatus` (ver abaixo).

## Como localizar contexto

| Preciso de… | Vou em… |
|---|---|
| Visão da empresa | `brain/company.md` |
| Índice do conhecimento | `brain/index.md` |
| Infra, integrações, operação | `brain/infrastructure/`, `brain/integrations/`, `brain/operations/` |
| Lista de clientes | `clients/index.yaml` |
| Contexto de um cliente | `clients/<slug>/profile.yaml` |
| Inventários factuais | `inventory/*.yaml` |
| Levantamentos brutos sanitizados | `docs/discovery/` |
| Arquitetura e decisões | `docs/architecture/`, `docs/adr/`, `DECISIONS.md` |
| Estado atual e próximos passos | `STATUS.md`, `TASKS.md` |

## Como identificar o cliente

1. O `slug` é a chave canônica. Está em `clients/index.yaml`.
2. A partir do slug, `clients/<slug>/profile.yaml` traz repositórios, domínios,
   contas e integrações.
3. Para o caminho inverso (achei um recurso, de quem é?), consulte
   `inventory/repositories.yaml`, `inventory/domains.yaml` ou
   `inventory/services.yaml` — cada entrada aponta `likelyClient`.
4. Se a associação não for certa, **não adivinhe**: registre
   `verificationStatus: unknown` e pergunte.

Valores válidos de `verificationStatus`: `owner_reported`, `discovered`,
`verified`, `conflicting`, `stale`, `unknown`.

## Como registrar decisões

- Decisão pequena ou operacional → linha em `DECISIONS.md` (data, decisão, motivo).
- Decisão arquitetural com alternativas e consequências → novo arquivo em
  `docs/adr/NNNN-titulo.md`, e uma linha em `DECISIONS.md` apontando para ele.
- Mudança de estado do sistema → atualize `STATUS.md`.
- Trabalho pendente → `TASKS.md`.

## Como tratar segredos

- Segredo não entra em arquivo versionado. Nunca. Nem em exemplo, nem em log,
  nem em inventário, nem em mensagem de commit.
- `.env` é local e ignorado. `.env.example` documenta apenas **nomes**.
- Proibido: `cat` em `.env`, `printenv`, `env`, `docker inspect` completo,
  `docker compose config` sem filtro.
- Ao encontrar possível segredo, reporte **arquivo, tipo provável e ação** —
  nunca o valor.
- Antes de commitar: `npm run scan:secrets`.
- Detalhes: `SECURITY.md` e `docs/security/secrets-policy.md`.

## Contas Google (separação obrigatória)

- `contato.automatizadoria@gmail.com` — conta administrativa **canônica** da
  AutomatizadorIA.
- `estudionovacena@gmail.com` — conta **separada**, exclusiva dos projetos
  Novacena.

Não misturar arquivos, e-mails, agendas, contatos ou recursos entre elas.
Ver `docs/security/access-matrix.md`.

## Quando pedir aprovação

Peça **antes** de:

- desligar o kill switch ou rodar em `EXECUTION_MODE=live`;
- qualquer escrita na VPS, no n8n, na Cloudflare, no DNS ou em bancos;
- qualquer alteração em repositório que não seja este;
- criar, pausar ou editar campanha de anúncios;
- enviar e-mail, mensagem ou publicar conteúdo;
- apagar qualquer coisa, em qualquer lugar;
- adicionar dependência com acesso a rede ou credencial.

Não precisa pedir para: ler, inventariar, documentar, rodar lint/typecheck/teste/
build, e corrigir erro reversível dentro deste repositório.
