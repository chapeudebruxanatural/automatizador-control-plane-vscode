import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink, stat } from 'node:fs/promises';
import { createRotatingFileAuditProvider } from '../../packages/audit/src/audit.js';

describe('rotating file audit provider', () => {
  it('creates rotated files when exceeding maxBytes', async () => {
    const base = join(tmpdir(), `demo-audit-${Date.now()}.jsonl`);
    // small maxBytes to trigger rotation quickly
    const provider = createRotatingFileAuditProvider(base, 200, 3);

    for (let i = 0; i < 50; i++) {
      await provider.record({ kind: `k${i}`, target: 't', mutating: false, outcome: 'executed', detail: `d${i}` });
    }

    // at least one rotated file should exist (base.1)
    let found = false;
    try {
      await stat(`${base}.1`);
      found = true;
    } catch (e: any) {
      found = false;
    }

    // cleanup (best-effort)
    try {
      await unlink(base);
      await unlink(`${base}.1`);
      await unlink(`${base}.2`);
    } catch {}

    assert.ok(found, 'expected at least one rotated backup file');
  });
});
