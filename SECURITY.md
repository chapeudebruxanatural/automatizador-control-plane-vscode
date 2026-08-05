# Segurança — AutomatizadorIA Control Plane

Este repositório é o **plano de controle** de uma operação que toca infraestrutura
de produção, contas de anúncios com verba real e dados de clientes. As regras
abaixo não são recomendações: são condições de funcionamento.

## Princípios

1. **Negar por padrão.** Toda ação com efeito colateral externo está desligada
   até ser explicitamente habilitada e aprovada.
2. **Segredo nunca entra no repositório.** Nem em código, nem em documentação,
   nem em inventário, nem em log, nem em mensagem de commit.
3. **Leitura antes de escrita.** Qualquer integração nova começa somente-leitura
   e só ganha escrita depois de inventário, teste e aprovação registrada.
4. **Rastreabilidade.** Toda ação de escrita produz registro de auditoria com
   quem pediu, o que foi feito, em qual cliente e com qual resultado.
5. **Separação de contas.** Recursos da AutomatizadorIA e da Novacena não se
   misturam. Ver [docs/security/access-matrix.md](docs/security/access-matrix.md).

## Kill switch

O Control Plane sobe com `CONTROL_PLANE_KILL_SWITCH=true` por padrão. Nesse
estado o sistema executa apenas leitura e simulação (`dry-run`); qualquer ação
de escrita é recusada na camada de domínio, antes de chegar ao adaptador.

Desligar o kill switch exige:

- justificativa registrada em `DECISIONS.md`;
- janela de tempo definida;
- aprovação humana explícita (`REQUIRE_HUMAN_APPROVAL=true`).

## Tratamento de segredos

- Segredos vivem em `.env` (nunca versionado) ou no keychain do sistema
  operacional. O `.env.example` documenta **nomes** de variáveis, nunca valores.
- O acesso ao GitHub usa o `gh` CLI já autenticado no keychain do macOS. Não
  duplicamos o token em arquivo.
- O acesso à VPS usa chave SSH referenciada em `~/.ssh/config`. A chave não é
  lida, copiada nem exibida por nenhum processo deste repositório.
- Nenhum agente, script ou documento deste repositório pode executar `cat` em
  `.env`, `printenv`, `env`, ou `docker inspect` completo em containers de
  produção — esses comandos revelam variáveis de ambiente.

Política detalhada: [docs/security/secrets-policy.md](docs/security/secrets-policy.md).

## Varredura antes do commit

```bash
npm run scan:secrets
```

O script `scripts/scan-secrets.sh` procura padrões conhecidos (chaves privadas,
tokens de GitHub/Google/Meta/AWS, URLs de banco com credencial embutida,
atribuições de senha) nos arquivos em *stage*. Ele reporta **arquivo, linha e
tipo provável** — e **nunca** o valor encontrado.

Para varrer todo o repositório:

```bash
npm run scan:secrets:all
```

O script é a primeira linha de defesa, não uma garantia. Ele não substitui
revisão humana nem detecção do lado do servidor.

## Se um segredo vazar

1. **Rotacione primeiro, limpe depois.** Um segredo que chegou ao histórico do
   Git deve ser considerado comprometido mesmo em repositório privado.
2. Revogue a credencial na plataforma de origem.
3. Emita uma nova e atualize o `.env` local.
4. Registre o incidente em `DECISIONS.md` com data, escopo e ação tomada.
5. Só então avalie reescrever histórico — e nunca com `force push` sem
   combinação prévia.

## Ações proibidas por padrão

Sem aprovação humana explícita e específica, o Control Plane e seus agentes
**não podem**:

- alterar, reiniciar, parar ou remover containers, serviços ou volumes na VPS;
- instalar pacotes ou serviços na VPS;
- executar `prune`, `migration` ou qualquer operação destrutiva;
- alterar DNS, proxy reverso, firewall ou configuração da Cloudflare;
- criar, pausar, editar ou excluir campanhas de anúncios;
- enviar e-mails, mensagens de WhatsApp ou publicar conteúdo;
- modificar repositórios de clientes;
- apagar qualquer recurso, em qualquer plataforma;
- fazer `force push`.

## Reportar um problema

Este é um repositório privado de operação interna. Problemas de segurança devem
ser tratados diretamente com o responsável técnico (Dado Cruz) e registrados em
`DECISIONS.md`.
