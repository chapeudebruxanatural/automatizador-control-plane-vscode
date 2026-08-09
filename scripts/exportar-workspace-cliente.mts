#!/usr/bin/env node

import { resolve } from 'node:path';

import {
  exportClientWorkspace,
  formatWorkspaceSummary,
} from '../packages/clients/src/workspace-export.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const clientSlug = argument('--cliente');
const destination = argument('--destino');
const repository = argument('--repositorio');

if (clientSlug === undefined || destination === undefined) {
  process.stderr.write(
    'Uso: npm run workspace:cliente -- --cliente <slug> --destino <diretório-vazio> ' +
      '[--repositorio owner/nome]\n',
  );
  process.exitCode = 2;
} else {
  try {
    const result = await exportClientWorkspace({
      root: resolve(import.meta.dirname, '..'),
      clientSlug,
      destination,
      ...(repository === undefined ? {} : { repository }),
    });
    process.stdout.write(`${formatWorkspaceSummary(result)}\n`);
  } catch (error) {
    process.stderr.write(`ERRO: ${error instanceof Error ? error.message : 'falha desconhecida'}\n`);
    process.exitCode = 1;
  }
}
