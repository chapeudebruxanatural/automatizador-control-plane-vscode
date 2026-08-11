import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { createFileApprovalProvider } from '../../packages/security/src/approval.js';

describe('file approval provider', () => {
  it('consumes single-use approvals and respects expiration', async () => {
    const filePath = join(tmpdir(), `demo-approvals-${Date.now()}.jsonl`);
    const record = { id: 't1', kind: 'x:do', approvedBy: 'tester', expiresAt: new Date(Date.now() + 60000).toISOString() };
    await writeFile(filePath, JSON.stringify(record) + '\n', 'utf8');

    const provider = createFileApprovalProvider(filePath);

    const first = await provider.decide({ kind: 'x:do' } as any, true);
    assert.equal(first.approved, true);
    assert.equal(first.approvedBy, 'tester');

    const second = await provider.decide({ kind: 'x:do' } as any, true);
    assert.equal(second.approved, false);

    const remaining = await readFile(filePath, 'utf8');
    assert.equal(remaining.trim(), '');
  });
});
