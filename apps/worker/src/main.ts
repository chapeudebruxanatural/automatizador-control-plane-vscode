/**
 * Worker de reconciliação.
 *
 * Nesta fase faz uma coisa só, e ela é útil: verifica o envelhecimento do
 * inventário. Lê os campos `lastVerifiedAt` dos arquivos de `inventory/` e
 * `clients/` e avisa quando algum passa do limite de `STALE_AFTER_DAYS`.
 *
 * Escolha deliberada: um worker que faz algo real e sem efeito colateral vale
 * mais que um laço vazio esperando implementação. Isso não sai da máquina, não
 * toca em rede e não escreve em lugar nenhum.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../../packages/shared/src/config.js';
import { createLogger, type Logger } from '../../../packages/shared/src/logger.js';
import { isStale, STALE_AFTER_DAYS } from '../../../packages/domain/src/verification.js';

const SCAN_DIRECTORIES = ['inventory', 'clients'];
const DATE_FIELD = /lastVerifiedAt:\s*(\d{4}-\d{2}-\d{2})/g;

interface StalenessFinding {
  readonly file: string;
  readonly oldestDate: string;
  readonly ageDays: number;
}

async function collectYamlFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectYamlFiles(full)));
    } else if (/\.ya?ml$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

async function checkStaleness(now: Date): Promise<StalenessFinding[]> {
  const findings: StalenessFinding[] = [];

  for (const dir of SCAN_DIRECTORIES) {
    try {
      await stat(dir);
    } catch {
      continue;
    }

    for (const file of await collectYamlFiles(dir)) {
      const content = await readFile(file, 'utf8');
      const dates = [...content.matchAll(DATE_FIELD)]
        .map((m) => m[1])
        .filter((d): d is string => d !== undefined)
        .sort();

      const oldest = dates[0];
      if (oldest === undefined) continue;

      const parsed = new Date(`${oldest}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) continue;

      if (isStale(parsed, now)) {
        findings.push({
          file,
          oldestDate: oldest,
          ageDays: Math.floor((now.getTime() - parsed.getTime()) / 86_400_000),
        });
      }
    }
  }

  return findings;
}

async function tick(logger: Logger): Promise<void> {
  const findings = await checkStaleness(new Date());

  if (findings.length === 0) {
    logger.info('inventário dentro da validade', { staleAfterDays: STALE_AFTER_DAYS });
    return;
  }

  logger.warn('inventário envelhecido', {
    staleAfterDays: STALE_AFTER_DAYS,
    count: findings.length,
    files: findings.map((f) => `${f.file} (${f.ageDays}d)`),
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    level: config.logLevel,
    service: `${config.serviceName}-worker`,
  });

  logger.info('worker iniciado', {
    killSwitch: config.killSwitch ? 'engaged' : 'DISENGAGED',
    executionMode: config.executionMode,
    task: 'verificação de envelhecimento do inventário',
  });

  await tick(logger);

  logger.info('worker concluído');
}

await main();
