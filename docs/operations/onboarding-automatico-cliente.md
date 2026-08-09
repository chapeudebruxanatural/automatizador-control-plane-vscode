# Onboarding automático de cliente

## Objetivo

Criar o projeto real de um novo cliente sem depender de cliques manuais:

1. repositório privado no GitHub;
2. projeto Cloudflare Pages ligado ao repositório;
3. starter estático com instruções para Codex, Claude e Copilot;
4. domínio customizado, quando informado e autorizado.

O workspace `cliente-<slug>-ops` é memória operacional opcional. Ele não é o
site e não substitui os repositórios reais como `cassio-ferraz`, `garbo` ou
`vivere`.

## Simulação obrigatória

```bash
npm run cliente:provisionar -- \
  --nome "Cliente Exemplo" \
  --slug cliente-exemplo \
  --dominio clienteexemplo.com.br
```

Sem `--aplicar`, nenhuma chamada externa ocorre. A saída mostra o plano, o ID
e a frase exata de confirmação.

## Execução

A execução exige simultaneamente:

- `CONTROL_PLANE_KILL_SWITCH=false`;
- `EXECUTION_MODE=live`;
- `REQUIRE_HUMAN_APPROVAL=true`;
- `--aplicar`;
- a frase `--confirmar "APROVAR ONBOARDING <id>"` do plano;
- token GitHub dedicado a criar repositórios privados;
- token Cloudflare dedicado com `Pages Write`;
- `CLOUDFLARE_ACCOUNT_ID` ou seu arquivo protegido padrão.

Segredos ficam em arquivos protegidos, nunca no comando, chat ou Git:

- `~/Documents/Codex/.secrets/github/provision-token`;
- `~/Documents/Codex/.secrets/cloudflare/provision-token`;
- `~/Documents/Codex/.secrets/cloudflare/account-id`.

O token de inventário somente leitura da Cloudflare não é reutilizado. A
integração GitHub da conta Cloudflare também precisa estar autorizada a acessar
o novo repositório; se não estiver, a API falha fechada e não inventa sucesso.

Estado verificado em 09/08/2026: o token Cloudflare da fábrica existe, está
ativo, possui somente `Pages Write`, expira em 09/08/2027 e vive no arquivo
protegido padrão. O token GitHub dedicado continua pendente de confirmação
administrativa na própria interface do GitHub.

## Limite atual

O provisionador cria Cloudflare Pages, adequado aos sites estáticos observados
na operação. Workers permanece escolha explícita para projetos avançados como
Cássio e Vivere e não é criado por este comando.
