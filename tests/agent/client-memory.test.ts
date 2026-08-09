import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  assertMemoryIsolation,
  buildConfirmationQuestions,
  clientMemorySchema,
  type ClientMemory,
} from '../../packages/agent/src/client-memory.js';

function sampleMemory(): ClientMemory {
  return {
    schemaVersion: 1,
    clientSlug: 'cliente-a',
    updatedAt: '2026-08-09',
    associations: [
      {
        id: 'domain-primary',
        kind: 'domain',
        value: 'exemplo.com',
        verificationStatus: 'discovered',
      },
      {
        id: 'repository-primary',
        kind: 'repository',
        value: 'dono/repositorio',
        verificationStatus: 'verified',
      },
      {
        id: 'whatsapp-official',
        kind: 'whatsapp',
        value: null,
        verificationStatus: 'unknown',
      },
    ],
    economics: {
      maxCostPerConversationBRL: { value: null, verificationStatus: 'unknown' },
      funnel: {
        conversations: null,
        contracts: null,
        period: null,
        verificationStatus: 'unknown',
      },
    },
  };
}

describe('perguntas de confirmação por cliente', () => {
  it('pergunta associações incertas e nunca repete as verificadas', () => {
    const questions = buildConfirmationQuestions(sampleMemory());
    const serialized = questions.map((question) => question.prompt).join('\n');
    assert.match(serialized, /exemplo\.com/);
    assert.match(serialized, /WhatsApp/);
    assert.doesNotMatch(serialized, /dono\/repositorio/);
  });

  it('mantém custo e fechamento como dados próprios do cliente', () => {
    const questions = buildConfirmationQuestions(sampleMemory());
    assert.ok(questions.some((question) => question.id === 'economics:max-cost-per-conversation'));
    assert.ok(questions.some((question) => question.id === 'economics:conversation-to-contract'));
    assert.ok(questions.every((question) => question.clientSlug === 'cliente-a'));
  });

  it('recusa arquivo cujo slug interno pertence a outro cliente', () => {
    assert.throws(() => assertMemoryIsolation('cliente-b', sampleMemory()), /memória cruzada/);
  });
});

describe('memórias versionadas', () => {
  it('todas validam e o slug interno coincide com a pasta', async () => {
    const root = resolve(import.meta.dirname, '../..');
    const index = parseYaml(await readFile(resolve(root, 'clients/index.yaml'), 'utf8')) as {
      clients?: readonly { slug?: string; memory?: string }[];
    };

    for (const client of index.clients ?? []) {
      assert.equal(typeof client.slug, 'string');
      assert.equal(typeof client.memory, 'string');
      const raw = parseYaml(await readFile(resolve(root, client.memory as string), 'utf8'));
      const memory = clientMemorySchema.parse(raw);
      assertMemoryIsolation(client.slug as string, memory);
    }
  });
});
