# Meta — o que o dono precisa resolver para validar a operação

Estado verificado em 09/08/2026. Nenhum ativo, campanha, pixel, usuário,
permissão ou token foi alterado durante o inventário.

## Faça agora, nesta ordem

1. **Conclua a chave de acesso/Touch ID** na aba Meta deixada em
   `Configurações → Usuários → Usuários do sistema`. O botão correto é
   `Usar chave de acesso`. Não envie senha, código ou biometria no chat.
2. **Responda uma decisão:** o portfólio `Dado Cruz` (`488135221601055`) é o
   portfólio central da AutomatizadorIA?
   - Se **sim**, ele pode hospedar o app e o usuário de sistema dedicados.
   - Se **não**, preservar tudo nele e criar um portfólio separado chamado
     `AutomatizadorIA`. Não renomear nem mover ativo antes da resposta.
3. **Confirme se o app existente `Dado Cruz` (`495604383589426`) tem uso.** Ele
   está não publicado e possui o caso de uso Login do Facebook para Empresas.
   Não reutilizar para anúncios só porque já existe.

## O que o Control Plane criará depois dessas duas respostas

1. App dedicado `AutomatizadorIA Control Plane`, pertencente ao portfólio
   central confirmado.
2. Usuário do sistema dedicado `automatizador-control-plane`, inicialmente
   como Employee e sem ativo atribuído por padrão.
3. Token temporário de inventário, salvo fora do Git em arquivo modo `600`.
   Primeiro lote: `ads_read` e `business_management`; permissões adicionais
   entram somente quando uma consulta real provar que são necessárias.
4. Atribuição explícita de cada conta, Página e pixel ao usuário do sistema.
   Não usar "todos os ativos" e não associar pelo nome.
5. Adaptador local somente leitura e inventário pela API. `ads_management`
   ficará em token/lote separado, atrás do kill switch e de aprovação por ação.

## O que precisa ser confirmado por cliente

Para cada cliente, envie ou confirme somente os IDs reais:

- portfólio empresarial proprietário;
- conta de anúncios;
- Página do Facebook;
- conta do Instagram;
- pixel/conjunto de dados;
- domínio onde o pixel deve medir;
- número oficial do WhatsApp;
- se a AutomatizadorIA é proprietária do ativo ou parceira com acesso.

Quando o cliente tem portfólio próprio, o desenho preferido é ele continuar
proprietário e compartilhar os ativos com o portfólio da AutomatizadorIA como
parceiro. Não mover propriedade para centralizar conveniência.

## Fatos que exigem correção ou decisão

- Existem 19 portfólios e zero associações de cliente confirmadas no inventário.
- `Dado Cruz` é verificado e possui a conta `ADM 01`, mas não exige 2FA.
- O seletor informa quatro Páginas; a grade interna mostrou três. A quarta fica
  `unknown` até aparecer por ID.
- Há somente uma conta do Instagram visível, `fotografiasedesign`, marcada como
  `Análise necessária`.
- Os dois pixels/conjuntos de dados visíveis são da NovaCena e não estão
  recebendo eventos. Eles não serão reutilizados para outro cliente.
- Já existem três usuários do sistema; dois são da Conversions API e alcançam
  ativos NovaCena. Não criar outro nem gerar token neles por conveniência.
- Existe um app chamado `Dado Cruz`; seu uso operacional ainda é `unknown`.
- Antes de exigir 2FA para todos, revisar as quatro pessoas do portfólio para
  não bloquear acesso legítimo. Depois da revisão, exigir 2FA para todos.

## Critério de validação concluída

Meta só ficará `verified` no Control Plane quando:

- o portfólio central estiver confirmado;
- cada ativo estiver associado a um cliente por ID;
- o token temporário responder a `/me`, listar negócios e listar somente as
  contas atribuídas;
- leitura de campanhas e insights funcionar sem `ads_management`;
- pixel e domínio de cada cliente forem conferidos no Events Manager;
- nenhum token, segredo de app ou CAPI aparecer em arquivo versionado ou log;
- uma tentativa de escrita for recusada pelo kill switch em teste controlado.
