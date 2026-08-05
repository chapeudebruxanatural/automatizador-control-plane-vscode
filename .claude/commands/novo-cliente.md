---
description: Cria o perfil estruturado de um novo cliente
argument-hint: <slug-do-cliente>
---

Crie o registro do cliente `$1`.

Passos:

1. Verifique se `$1` já existe em `clients/index.yaml`. Se existir, atualize em
   vez de duplicar.
2. Crie `clients/$1/profile.yaml` seguindo exatamente o mesmo esquema de campos
   dos perfis existentes — use um deles como referência estrutural.
3. Procure evidências nos inventários: repositórios em
   `inventory/repositories.yaml` cujo nome ou descrição sugira `$1`, domínios em
   `inventory/domains.yaml`, serviços em `inventory/services.yaml`.
4. Separe com rigor `confirmedRepositories` de `likelyRepositories`. Um
   repositório só é confirmado se houve checagem real, não semelhança de nome.
5. Preencha `verificationStatus` de acordo com a procedência de cada dado:
   `owner_reported`, `discovered`, `verified`, `conflicting`, `stale` ou
   `unknown`. Não invente IDs externos e não promova inferência a fato.
6. Defina `lastVerifiedAt` com a data de hoje.
7. Adicione a entrada em `clients/index.yaml`.
8. Liste, em `nextSteps`, o que ainda precisa ser descoberto sobre este cliente.

Não crie arquivos vazios. Se um dado não é conhecido, registre `unknown` com uma
nota do que faltou — isso é informação, arquivo vazio não é.
