import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createGitHubReadAdapter } from '../../packages/integrations/src/github/adapter.js';
import {
  GitHubReadClient,
  GitHubReadError,
  type GhReadRunner,
} from '../../packages/integrations/src/github/client.js';

const response = JSON.stringify([
  {
    name: 'site-cliente',
    url: 'https://github.com/dadocruz/site-cliente',
    isPrivate: true,
    defaultBranchRef: { name: 'main' },
    primaryLanguage: { name: 'TypeScript' },
    updatedAt: '2026-08-09T00:00:00Z',
  },
]);

describe('cliente GitHub somente leitura', () => {
  it('usa somente gh repo list e devolve fatos sem inferir cliente', async () => {
    const calls: string[][] = [];
    const runner: GhReadRunner = (args) => {
      calls.push([...args]);
      return Promise.resolve(response);
    };
    const client = new GitHubReadClient({ owner: 'dadocruz', runner });

    const repositories = await client.listRepositories('dadocruz');

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.slice(0, 3), ['repo', 'list', 'dadocruz']);
    assert.equal(repositories[0]?.name, 'site-cliente');
    assert.equal(repositories[0]?.likelyClient, null);
    assert.equal(repositories[0]?.verificationStatus, 'verified');
    assert.ok(calls[0]?.every((argument) => !/create|delete|edit|archive/i.test(argument)));
  });

  it('recusa owner diferente antes de executar o gh', async () => {
    let called = false;
    const client = new GitHubReadClient({
      owner: 'dadocruz',
      runner: () => {
        called = true;
        return Promise.resolve(response);
      },
    });

    await assert.rejects(client.listRepositories('outro-owner'), /fora do escopo/);
    assert.equal(called, false);
  });

  it('recusa nome de repositório que possa alterar a linha de comando', async () => {
    const client = new GitHubReadClient({
      owner: 'dadocruz',
      runner: () => Promise.resolve(response),
    });
    await assert.rejects(client.getRepository('dadocruz', '--help;delete'), /inválido/);
  });

  it('não inclui saída potencialmente sensível do gh no erro', async () => {
    const client = new GitHubReadClient({
      owner: 'dadocruz',
      runner: () => Promise.reject(new Error('token-potencialmente-sensível')),
    });

    await assert.rejects(
      client.listRepositories('dadocruz'),
      (error: unknown) =>
        error instanceof GitHubReadError && !error.message.includes('token-potencialmente-sensível'),
    );
  });

  it('adaptador não expõe métodos de escrita', async () => {
    const adapter = createGitHubReadAdapter(
      new GitHubReadClient({ owner: 'dadocruz', runner: () => Promise.resolve(response) }),
    );
    assert.equal((await adapter.getRepository('dadocruz', 'site-cliente'))?.name, 'site-cliente');
    assert.equal('createRepository' in adapter, false);
    assert.equal('deleteRepository' in adapter, false);
    assert.equal('archiveRepository' in adapter, false);
  });
});
