# Runbook — restauração

Restaurar é o que prova que o backup existe. Enquanto uma restauração não for
executada e verificada, o backup é hipótese.

## Princípio

**Nunca restaure sobre produção para testar.** `restore-postgres.sh` sobe um
container descartável, sem porta publicada e sem rede (`--network none`), e o
remove ao final. Não existe opção neste script para restaurar sobre um banco
existente — a ausência é deliberada.

## 1. Conferir integridade

```bash
scripts/restore/verify-manifest.sh --manifest <manifest.json> --dir <artefatos>
```

Recalcula o `sha256` de cada artefato e compara com o registrado. Saída `0`
íntegro, `1` divergente ou ausente.

Detecta corrupção silenciosa e arquivo truncado — as duas formas mais comuns de
um backup existir e não servir. Foi exercitado contra um artefato adulterado e
detectou a diferença.

## 2. Provar que o dump abre

```bash
scripts/restore/restore-postgres.sh --file <arquivo.dump>
```

Simula e explica cada passo. Para executar:

```bash
scripts/restore/restore-postgres.sh --file <arquivo.dump> --apply
```

O que acontece: sobe `postgres:16-alpine` isolado, aguarda `pg_isready`, cria a
base `restore_check`, roda `pg_restore`, **conta tabelas e linhas**, e remove o
container.

A contagem é o que decide. `pg_restore` costuma reclamar de role ou extensão
ausente sem que isso signifique falha; zero tabelas restauradas, sim.

Use `--keep` para manter o container e inspecionar manualmente.

## 3. Restaurar de verdade

Isso é **Nível 2** e não tem script, de propósito. Restauração real sobre
produção é decisão, não automação.

Roteiro mínimo:

1. Parar o que escreve no banco (não o banco)
2. Renomear a base atual em vez de apagar — se a restauração falhar, você ainda
   tem a original
3. Criar base nova e restaurar nela
4. Conferir contagens contra o esperado
5. Apontar a aplicação para a base nova
6. Só depois de dias de operação normal, considerar remover a antiga

Rotação em vez de sobrescrita, em todos os passos.

## Restaurar um volume

Os volumes são `tar.gz` simples:

```bash
tar -tzf <volume>.tar.gz | head -20
```

```bash
mkdir -p /tmp/verify && tar -xzf <volume>.tar.gz -C /tmp/verify
```

Inspecione `/tmp/verify` antes de considerar restaurado. Escrever de volta em um
volume com o serviço rodando é Nível 2.

## Quando o backup falha na verificação

1. **Não apague nada.** O artefato ruim é evidência.
2. Confira se há artefato anterior íntegro.
3. Rode um backup novo e verifique imediatamente.
4. Se o novo também falhar, o problema é o processo, não o arquivo.
5. Registre em `DECISIONS.md`.

## Estado atual

| Item | Situação |
|---|---|
| Integridade por checksum | testado, incluindo detecção de corrupção |
| Extração de volume | testado com dados sintéticos |
| Restauração PostgreSQL | **apenas dry-run** — exige Docker, indisponível localmente |
| Restauração de backup real | **nunca executada** |

O backup existente do NovaCena Motion **nunca foi restaurado**. Essa é a
verificação de maior valor pendente, e ela é barata: baixar um `tar.gz` do S3 e
extrair em diretório isolado.
