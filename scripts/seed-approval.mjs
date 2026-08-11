#!/usr/bin/env node
import { mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function seed(filePath, kind, approvedBy, ttlSeconds = 3600) {
  await ensureDir(filePath);
  const record = {
    id: `seed-${Date.now()}`,
    kind,
    approvedBy,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');
  console.log('Seeded approval:', record);
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: seed-approval.mjs <approvals-file> <kind> [approvedBy] [ttlSeconds]');
  process.exit(1);
}

const [filePath, kind, approvedBy = 'local-runner', ttl = '3600'] = args;
seed(filePath, kind, approvedBy, Number(ttl)).catch((e) => {
  console.error('Failed to seed approval:', e);
  process.exit(1);
});
