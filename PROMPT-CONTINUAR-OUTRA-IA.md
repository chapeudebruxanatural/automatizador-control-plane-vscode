# Continuação da AutomatizadorIA em outra IA

Atualizado em 09/08/2026. Este arquivo não contém segredos.

## Prompt para Kimi K3, Claude Code ou Copilot no VS Code

```text
Você vai assumir o control plane da AutomatizadorIA no repositório privado
dadocruz/automatizador-control-plane, branch main.

ANTES DE QUALQUER AÇÃO, leia CONTINUAR-AQUI.md inteiro. Depois leia, nesta
ordem: CLAUDE.md, HANDOFF.md (comece pelas RETOMADAS finais), DECISIONS.md,
TASKS.md, STATUS.md e docs/operations/onboarding-automatico-cliente.md.

Não invente associação entre cliente, repositório, domínio, campanha,
WhatsApp, pixel, workflow ou conta. Se não houver prova, use
verificationStatus: unknown e pergunte. A conta Google Ads é compartilhada e
opera dinheiro real.

Regras invioláveis:
- segredo nunca entra em chat, log, commit ou arquivo versionado;
- kill switch começa ligado;
- peça aprovação antes de campanha, orçamento, status, mensagem, publicação,
  exclusão, dependência ou escrita em VPS, n8n, Cloudflare, DNS ou banco;
- não tocar na campanha Buteco Sertanejo 24105770570;
- não tocar na campanha removida da Gaveta 24079586567;
- tudo em português do Brasil;
- ao terminar, atualize HANDOFF.md e DECISIONS.md.

Estado atual verificado:
1. A fábrica de novos projetos está publicada na main. O comando
   npm run cliente:provisionar simula primeiro e, no modo aprovado, cria:
   repositório GitHub privado, Cloudflare Pages conectado, starter e domínio
   opcional. Pages é o padrão estático; Workers nunca é inferido.
2. O token Cloudflare dedicado está ativo, tem somente Pages Write, expira em
   09/08/2027 e vive fora do Git em
   ~/Documents/Codex/.secrets/cloudflare/provision-token, modo 600. O account id
   vive em ~/Documents/Codex/.secrets/cloudflare/account-id, modo 600.
3. O token GitHub dedicado ainda NÃO existe: a tela de fine-grained token está
   bloqueada na confirmação administrativa. O dono deve inserir pessoalmente o
   código; nunca pedir o código no chat. Depois criar token para dadocruz, todos
   os repositórios, Administration: write e Contents: write, validade de um
   ano, e salvar em
   ~/Documents/Codex/.secrets/github/provision-token, modo 600.
4. Não crie projeto fictício. O primeiro onboarding real só começa quando o
   dono informar nome, slug e domínio do novo cliente. Gere dry-run, mostre a
   frase e peça confirmação exata antes de --aplicar.
5. Os repositórios reais de sites incluem, entre outros: novacena-motion,
   vivere, cassio-ferraz, gabriel-gadelha-casamentos, novacena-music,
   4cadeiras, malta-sertaneja, garbo, encantaria_artesanal, chay-portal,
   gaveta-monitor e automatizadoria-compliance-site. Não associe os nomes
   incertos a clientes sem prova.
6. Existem oito repositórios privados cliente-*-ops. Eles são memória
   operacional opcional, não substituem os sites. O do Cássio contém o piloto;
   os outros sete estão apenas criados.
7. CI da main passou após a publicação da fábrica. Localmente passaram lint,
   typecheck, build, 286 testes/76 suítes sem socket e scanners de 212 arquivos
   rastreados + 28 novos, zero segredos. O sandbox local suspende somente
   api.test.ts e whatsapp/webhook-route.test.ts; o CI valida os sockets.
8. O gh CLI local estava sem autenticação. Não tente colar PAT no terminal ou
   chat; use gh auth login -h github.com -p https -w depois da confirmação
   pessoal no navegador.

Contexto operacional que não pode se perder:
- Garbo: incidente de 07/08 fechado; a causa foi o script legado
  GARBO | TRAVA R$100 | 20260728 (11999683). O dono atualizou pessoalmente as
  campanhas e decidiu manter cinco ativas nos orçamentos documentados. Deixe
  como está.
- Buteco/Gaveta: mídia nova foi rejeitada por direito autoral; aguardar a
  reivindicação do dono. Não tocar nas campanhas protegidas acima.
- Cássio: relatório pronto em
  reports/cassio-ferraz/relatorio-whatsapp-2026-08-09.md. A leitura ao vivo
  documentada registrou 20 microconversões WHATSAPP - CÁSSIO nas Demand Gen,
  R$ 368,97 e R$ 18,45 por registro; incluindo Search sem conversão,
  R$ 406,57 e R$ 20,33. Cidades: São Paulo 9; Brasília, Goiânia e Rio 3 cada;
  Curitiba e Salvador 1 cada. Não chamar microconversão de contrato. O
  relatório ainda não foi enviado.
- n8n: 33 workflows, 1 ativo, 32 inativos, 3 arquivados; associações a cliente
  continuam unknown. A chave temporária expira em 16/08/2026; cliente local é
  GET-only.
- Cloudflare inventariado: 8 zonas, 10 Pages e 3 Workers. Cássio e Vivere usam
  Workers; Garbo usa Pages. Não inferir os demais vínculos.
- Meta: portfólio empresarial 488135221601055; app dedicado visto em
  1046773687948340; usuário do sistema Automatizadoria 61593000755608. Não há
  neste handoff prova suficiente do estado final do token Meta. Leia o HANDOFF
  e verifique na interface antes de declarar ou operar. Nunca registrar valor.
- Segurança aberta: senha root da VPS e TOTP exposto da Vivere ainda precisam
  ser rotacionados; o dono adiou. Firewall/backup da VPS também seguem
  pendentes. Não escrever na VPS sem lote e aprovação específicos.

Primeira ação ao assumir:
git status --short --branch
npm ci
npm run verify
npm run scan:secrets:all

Depois confira a main e o CI mais recente. Se a credencial GitHub ainda estiver
pendente, pare apenas esse subpasso e peça ao dono para concluir a confirmação
na aba aberta. Continue todo trabalho seguro que não dependa dela.
```

## VS Code com a conta de estudante

Use um clone limpo; o checkout antigo em `~/Projetos/automatizador-control-plane`
tem alterações locais anteriores e não deve receber `git pull` por cima.

1. Confirme em <https://github.com/settings/education/benefits> que o benefício
   estudantil está ativo e habilite o Copilot Student.
2. Atualize o VS Code. Abra **Accounts** e entre no GitHub como `dadocruz`.
3. Instale/ative as extensões oficiais **GitHub Copilot** e **GitHub Copilot
   Chat**.
4. Abra a paleta (`Cmd+Shift+P`) → **Git: Clone** → cole
   `https://github.com/dadocruz/automatizador-control-plane.git` → escolha uma
   pasta nova, por exemplo `~/Projetos/automatizador-control-plane-vscode`.
5. Abra o clone e escolha **Trust this workspace** somente depois de conferir a
   origem `dadocruz/automatizador-control-plane`.
6. No terminal integrado:

   ```bash
   npm ci
   npm run verify
   npm run scan:secrets:all
   gh auth login -h github.com -p https -w
   gh auth status
   ```

   O login do `gh` abre o navegador; não cole token no terminal ou no chat.
7. Abra o Copilot Chat em modo Agent e cole o prompt acima. Peça primeiro:
   `Leia os arquivos obrigatórios e me devolva somente fatos verificados,
   incertezas e a próxima ação segura; não altere nada ainda.`
8. Os arquivos protegidos já ficam fora do repositório em
   `~/Documents/Codex/.secrets/`; o clone novo usa os mesmos caminhos padrão.
9. Para alternar de IA, abra o mesmo clone e cole o mesmo prompt. A memória
   persistente é o Git, especialmente `CONTINUAR-AQUI.md`, `HANDOFF.md`,
   `DECISIONS.md`, `TASKS.md` e os workspaces privados — não o histórico do chat.

## Primeiro onboarding real

Depois que o token GitHub estiver salvo e o dono informar o cliente:

```bash
npm run cliente:provisionar -- \
  --nome "NOME DO CLIENTE" \
  --slug slug-do-cliente \
  --dominio dominio-do-cliente.com.br
```

Leia o plano e peça a confirmação exata. Somente então, num processo com
`CONTROL_PLANE_KILL_SWITCH=false`, `EXECUTION_MODE=live` e
`REQUIRE_HUMAN_APPROVAL=true`, repita com `--aplicar --confirmar "..."`.

