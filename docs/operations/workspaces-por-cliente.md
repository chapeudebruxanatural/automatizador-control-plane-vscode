# Workspaces privados por cliente

## Objetivo

Permitir que qualquer IA continue um cliente sem depender do histórico de um
chat e sem carregar os demais clientes no contexto.

## Gerar um workspace

Use um diretório novo e vazio:

```bash
npm run workspace:cliente -- \
  --cliente cassio-ferraz \
  --destino /tmp/cliente-cassio-ferraz-ops \
  --repositorio dadocruz/cliente-cassio-ferraz-ops
```

O comando não acessa rede, não cria repositório e não publica nada. Ele:

1. confere o slug em `clients/index.yaml`;
2. copia o template portátil;
3. copia somente arquivos de contexto permitidos;
4. exclui `security.yaml` por política;
5. recusa destino que já tenha conteúdo;
6. grava `CLIENTE.yaml` com procedência e `verificationStatus`.

## Criar no GitHub

1. criar repositório privado no nome registrado em
   `inventory/client-workspaces.yaml`;
2. conferir que a visibilidade é `Private` antes do primeiro push;
3. publicar o workspace gerado;
4. revisar `CLIENTE.yaml` e o diretório `context/`;
5. registrar `actualRepository` e a fonte da conferência no inventário central;
6. atualizar `HANDOFF.md` nos dois repositórios.

Criar o repositório é escrita externa. O gerador local não transforma o nome
desejado em fato existente.

## Rotação de IA

Toda ferramenta recebe a mesma instrução inicial:

> Leia `CONTINUAR-AQUI.md` inteiro, depois `CLIENTE.yaml`, `HANDOFF.md`,
> `DECISIONS.md` e `TASKS.md`. Não execute ação externa diretamente.

O trabalho deve terminar em commit ou pull request e atualizar o handoff. Uma
conversa não concluída sem registro no Git não é memória operacional.

## O que não vai para o workspace

- senhas, tokens, cookies, chaves, TOTP ou arquivos `.env`;
- credenciais do Google, Meta, Cloudflare, n8n ou VPS;
- contexto de outro cliente;
- allowlist que concede escrita;
- auditoria bruta com identificadores sensíveis.

## Piloto

O primeiro workspace é `cassio-ferraz`, porque possui repositório privado,
campanhas, tracking, relatório e memória já estruturados. O workspace
operacional será separado do repositório do site. Garbo vem depois: o site está
em repositório público, logo a separação evita publicar contexto comercial.
