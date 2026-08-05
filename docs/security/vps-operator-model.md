# Modelo do usuário operacional da VPS

Data: 2026-08-05 · **Modelo preparado. Usuário `automatizador` NÃO foi
criado.** Criar o usuário real exige apresentar esta política e obter
aprovação explícita — ou autorização já dada nesta conversa, o que não é o
caso aqui.

## Problema que isto resolve

O acesso atual à VPS é **root, direto, sem senha** (chave SSH). Root não tem
grau: cada comando é, por definição, capaz de qualquer coisa. Isso é
conveniente e é exatamente o que torna qualquer automação — inclusive um
agente de IA rodando inventário — um risco desproporcional ao que ela
precisa fazer.

O usuário `automatizador` restringe a automação recorrente (coleta de
inventário, checagem de saúde) a **exatamente** o que ela precisa: leitura.
Root continua existindo, para os humanos, para as poucas ações que
legitimamente precisam de privilégio total.

## Desenho

| Propriedade | Valor | Por quê |
|---|---|---|
| Senha interativa | **nenhuma** | Login por senha é vetor de força bruta. Não deveria existir. |
| Shell de login | `/usr/sbin/nologin` | O usuário nunca abre um shell interativo. Toda ação passa pelo `sudo` com comando explícito. |
| Chave SSH | dedicada, com passphrase | Separada da chave root. Comprometer uma não compromete a outra. |
| Autenticação | apenas chave pública | Igual ao root hoje, mas chave própria. |
| `sudo` | lista branca via `/etc/sudoers.d/automatizador` | Ver [`automatizador-sudoers.example`](../../infrastructure/vps/automatizador-sudoers.example). |
| Grupo `docker` | **não incluído** | Pertencer ao grupo `docker` equivale a root — o socket do Docker não distingue usuário. A permissão vem só pelo `sudo`, comando a comando. |

## Por que lista branca, e por que no `sudo`, não no shell

**Lista branca, não lista negra.** Um sudoers que nega comandos perigosos e
permite o resto falha aberto: qualquer comando novo, ainda não previsto, passa.
Um sudoers que só permite o que está listado falha fechado: comando não
previsto é recusado por padrão, sem que ninguém precise lembrar de bloqueá-lo
depois.

**No `sudo`, não em wrapper de shell.** Um script que filtra comandos antes de
executá-los (como o guarda de `scripts/collect-vps-inventory.sh`, usado deste
lado do SSH) é defesa em profundidade útil, mas continua sendo software que
pode ter bug. O `sudo` com lista branca é aplicado pelo próprio sistema
operacional, na chamada de syscall — uma camada abaixo de qualquer script que
possa ter sido escrito errado.

As duas camadas coexistem: o guarda local recusa antes de sequer tentar
enviar o comando; o sudoers recusa no destino, caso o guarda falhe.

## O que o usuário **não** pode fazer, e como isso é garantido

| Proibição | Mecanismo |
|---|---|
| Senha interativa | Conta sem senha definida (`passwd -l` na criação) |
| Shell irrestrito | `/usr/sbin/nologin` como shell |
| Acesso a arquivo de segredo | Sem permissão de leitura em `/root`, `.env`, chaves — o usuário não é membro de nenhum grupo com esse acesso |
| Desligar a VPS | `reboot`, `shutdown`, `poweroff` explicitamente negados no sudoers |
| Remover volume | Nenhum comando de escrita do Docker está na lista branca |
| Executar prune | `docker system/volume/image prune` ausente da lista, e negado explicitamente |
| Alterar firewall | `ufw`, `iptables` negados explicitamente |
| Editar sudoers | `visudo` negado explicitamente — o usuário não pode ampliar os próprios privilégios |

Cada proibição do pedido original tem uma linha correspondente e testável no
arquivo de exemplo — não é uma declaração de intenção solta neste documento.

## Validação já realizada

O arquivo [`automatizador-sudoers.example`](../../infrastructure/vps/automatizador-sudoers.example)
foi validado com `visudo -cf` **localmente, nesta máquina**, com resultado
`parsed OK`. A sintaxe está correta antes mesmo de chegar à VPS.

O script [`scripts/vps/read-only-status.sh`](../../scripts/vps/read-only-status.sh)
usa exclusivamente comandos presentes na lista branca — cada uma das 13
chamadas de `sudo` no script corresponde a exatamente uma linha de permissão
no arquivo de exemplo. Ele serve como **teste de aceitação** do modelo: se
depois de criado o usuário real algum comando do script falhar por falta de
permissão, é o sudoers que está incompleto, não o script.

## O que falta para criar o usuário de verdade

1. **Aprovação explícita do dono**, apresentando este documento
2. Gerar par de chaves SSH dedicado (nunca reaproveitar a chave root)
3. Criar o usuário na VPS: `useradd -m -s /usr/sbin/nologin automatizador`
4. Instalar a chave pública em `~automatizador/.ssh/authorized_keys`
5. Copiar `automatizador-sudoers.example` para
   `/etc/sudoers.d/automatizador` (sem a extensão `.example`)
6. Validar na própria VPS: `visudo -cf /etc/sudoers.d/automatizador`
7. `chmod 440 /etc/sudoers.d/automatizador`
8. Testar com `ssh -i <chave-dedicada> automatizador@nvvps` e rodar
   `read-only-status.sh` de ponta a ponta
9. **Só depois de tudo funcionando**, migrar os coletores locais
   (`scripts/collect-vps-*.sh`) para usar o novo alias, mantendo o acesso root
   como está — este modelo não remove nada do que já existe

## O que este modelo explicitamente não faz

Não desabilita o login root. Não altera `sshd_config`. Não revoga a chave
root existente. É aditivo: cria um caminho de menor privilégio para uso
recorrente, sem tocar no caminho que já existe para uso humano excepcional.

Desabilitar root fica para uma decisão futura, separada, depois que o usuário
operacional tiver sido usado e comprovado em produção.
