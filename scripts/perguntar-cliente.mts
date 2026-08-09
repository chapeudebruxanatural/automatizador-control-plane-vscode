#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  assertMemoryIsolation,
  buildConfirmationQuestions,
  clientMemorySchema,
} from '../packages/agent/src/client-memory.js';
import { describeResolution, resolveClient } from '../packages/agent/src/client-resolver.js';

interface ClientIndex {
  readonly clients?: readonly {
    readonly slug?: string;
    readonly name?: string;
    readonly aliases?: readonly string[];
    readonly memory?: string;
  }[];
}

const root = resolve(import.meta.dirname, '..');
const index = parseYaml(await readFile(resolve(root, 'clients/index.yaml'), 'utf8')) as ClientIndex;
const clients = (index.clients ?? [])
  .filter((item): item is Required<Pick<typeof item, 'slug' | 'name'>> & typeof item =>
    typeof item.slug === 'string' && typeof item.name === 'string',
  )
  .map((item) => ({ slug: item.slug, name: item.name, aliases: item.aliases, memory: item.memory }));

const flagPosition = process.argv.indexOf('--cliente');
const term = flagPosition >= 0 ? process.argv[flagPosition + 1] : process.argv[2];

async function loadMemory(client: (typeof clients)[number]) {
  const relative = client.memory ?? `clients/${client.slug}/memory.yaml`;
  const raw = parseYaml(await readFile(resolve(root, relative), 'utf8'));
  const memory = clientMemorySchema.parse(raw);
  assertMemoryIsolation(client.slug, memory);
  return memory;
}

if (term === undefined || term.trim() === '') {
  process.stdout.write('Fila de confirmação por cliente:\n');
  for (const client of clients) {
    const questions = buildConfirmationQuestions(await loadMemory(client));
    process.stdout.write(`- ${client.name} (${client.slug}): ${questions.length} pendência(s)\n`);
  }
  process.stdout.write('\nUse: npm run perguntar:cliente -- --cliente <nome-ou-slug>\n');
  process.exit(0);
}

const resolution = resolveClient(term, clients);
if (resolution.status !== 'resolved') {
  process.stderr.write(`${describeResolution(resolution)}\n`);
  process.exitCode = 2;
} else {
  const client = clients.find((item) => item.slug === resolution.slug);
  if (client === undefined) throw new Error(`cliente resolvido não encontrado: ${resolution.slug}`);
  const questions = buildConfirmationQuestions(await loadMemory(client));

  process.stdout.write(`FICHA — ${client.name} (${client.slug})\n`);
  if (questions.length === 0) {
    process.stdout.write('Nenhuma confirmação pendente.\n');
  } else {
    process.stdout.write('Responda copiando o número e a resposta:\n\n');
    questions.forEach((question, indexQuestion) => {
      process.stdout.write(`${indexQuestion + 1}. ${question.prompt}\n`);
      process.stdout.write(`   Resposta: ${question.answerHint}\n`);
    });
  }
}
