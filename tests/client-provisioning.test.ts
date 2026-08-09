import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  CloudflareProvisioningClient,
  CloudflareProvisioningError,
} from '../packages/onboarding/src/cloudflare-provisioning.js';
import {
  GitHubProvisioningClient,
  GitHubProvisioningError,
} from '../packages/onboarding/src/github-provisioning.js';
import { loadProvisioningCredentials } from '../packages/onboarding/src/credentials.js';
import { buildClientProvisioningPlan } from '../packages/onboarding/src/plan.js';
import { provisionClientProject } from '../packages/onboarding/src/provision.js';
import type { ProvisionedPagesProject, ProvisionedRepository } from '../packages/onboarding/src/types.js';

const plan = buildClientProvisioningPlan({
  clientName: 'Cliente Teste',
  clientSlug: 'cliente-teste',
  customDomain: 'cliente.example.com',
});

const repository: ProvisionedRepository = {
  id: '123',
  ownerId: '456',
  name: 'cliente-teste',
  url: 'https://github.com/dadocruz/cliente-teste',
  defaultBranch: 'main',
  visibility: 'private',
};

const pagesProject: ProvisionedPagesProject = {
  id: 'pages-1',
  name: 'cliente-teste',
  subdomain: 'cliente-teste.pages.dev',
};

describe('plano de onboarding', () => {
  it('define GitHub privado e Cloudflare Pages com confirmação específica', () => {
    assert.equal(plan.github.repository, 'cliente-teste');
    assert.equal(plan.github.visibility, 'private');
    assert.equal(plan.cloudflare.kind, 'pages');
    assert.match(plan.confirmationPhrase, /^APROVAR ONBOARDING [a-f0-9]{12}$/);
  });

  it('recusa slug e domínio ambíguos', () => {
    assert.throws(() => buildClientProvisioningPlan({ clientName: 'Teste', clientSlug: '../outro' }));
    assert.throws(() =>
      buildClientProvisioningPlan({
        clientName: 'Teste',
        clientSlug: 'teste',
        customDomain: 'https://exemplo.com',
      }),
    );
  });
});

describe('execução do onboarding', () => {
  it('dry-run não chama GitHub nem Cloudflare', async () => {
    const result = await provisionClientProject({ plan, apply: false });
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.repository, null);
  });

  it('live falha fechado com kill switch ligado', async () => {
    await assert.rejects(
      provisionClientProject({
        plan,
        apply: true,
        confirmation: plan.confirmationPhrase,
        env: {
          CONTROL_PLANE_KILL_SWITCH: 'true',
          EXECUTION_MODE: 'live',
          REQUIRE_HUMAN_APPROVAL: 'true',
        },
      }),
      /bloqueado/,
    );
  });

  it('live exige frase exata e executa na ordem segura', async () => {
    const calls: string[] = [];
    const dependencies = {
      github: {
        createPrivateRepository: () => {
          calls.push('github.create');
          return Promise.resolve(repository);
        },
        seedFiles: (_repo: string, _branch: string, files: readonly { path: string }[]) => {
          calls.push(`github.seed:${files.length}`);
          assert.ok(files.some((file) => file.path === 'CLIENTE.yaml'));
          return Promise.resolve();
        },
      },
      cloudflare: {
        createPagesProject: () => {
          calls.push('cloudflare.create');
          return Promise.resolve(pagesProject);
        },
        addPagesDomain: () => {
          calls.push('cloudflare.domain');
          return Promise.resolve();
        },
      },
    };
    const env = {
      CONTROL_PLANE_KILL_SWITCH: 'false',
      EXECUTION_MODE: 'live',
      REQUIRE_HUMAN_APPROVAL: 'true',
    };

    await assert.rejects(
      provisionClientProject({ plan, apply: true, confirmation: 'errada', env, dependencies }),
      /confirmação inválida/,
    );
    const result = await provisionClientProject({
      plan,
      apply: true,
      confirmation: plan.confirmationPhrase,
      env,
      dependencies,
    });
    assert.equal(result.mode, 'live');
    assert.deepEqual(calls, [
      'github.create',
      'cloudflare.create',
      'github.seed:7',
      'cloudflare.domain',
    ]);
  });
});

describe('clientes de provisionamento', () => {
  it('GitHub usa POST privado e PUT com conteúdo em base64', async () => {
    const calls: Array<{ url: string; method: string; body: string; authorization: string }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        body: String(init?.body ?? ''),
        authorization: headers.get('Authorization') ?? '',
      });
      if (String(input).endsWith('/user/repos')) {
        return new Response(
          JSON.stringify({
            id: 123,
            name: 'cliente-teste',
            html_url: 'https://github.test/dadocruz/cliente-teste',
            private: true,
            default_branch: 'main',
            owner: { id: 456 },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } });
    };
    const client = new GitHubProvisioningClient({
      owner: 'dadocruz',
      token: 'token-teste',
      baseUrl: 'https://github.test',
      fetchImpl: fakeFetch,
    });
    const created = await client.createPrivateRepository({
      name: 'cliente-teste',
      description: 'teste',
    });
    await client.seedFiles(created.name, 'main', [{ path: 'index.html', content: 'olá' }]);

    assert.equal(calls[0]?.method, 'POST');
    assert.equal(JSON.parse(calls[0]?.body ?? '{}').private, true);
    assert.equal(calls[1]?.method, 'PUT');
    assert.equal(JSON.parse(calls[1]?.body ?? '{}').content, Buffer.from('olá').toString('base64'));
    assert.ok(calls.every((call) => call.authorization === 'Bearer token-teste'));
    assert.ok(calls.every((call) => !call.url.includes('token-teste')));
  });

  it('Cloudflare cria Pages ligado ao repositório e adiciona domínio', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as unknown });
      return new Response(
        JSON.stringify({
          success: true,
          result: { id: 'pages-1', name: 'cliente-teste', subdomain: 'cliente-teste.pages.dev' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const client = new CloudflareProvisioningClient({
      accountId: 'conta-1',
      token: 'token-teste',
      baseUrl: 'https://cloudflare.test',
      fetchImpl: fakeFetch,
    });
    await client.createPagesProject({
      projectName: 'cliente-teste',
      repository,
      githubOwner: 'dadocruz',
      productionBranch: 'main',
    });
    await client.addPagesDomain('cliente-teste', 'cliente.example.com');

    assert.equal(calls.length, 2);
    assert.equal((calls[0]?.body as { source?: { type?: string } }).source?.type, 'github');
    assert.match(calls[1]?.url ?? '', /\/domains$/);
  });

  it('erros nunca incluem corpo potencialmente sensível', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ message: 'segredo-no-corpo' }), { status: 403 });
    const github = new GitHubProvisioningClient({
      owner: 'dadocruz',
      token: 'teste',
      fetchImpl: fakeFetch,
    });
    const cloudflare = new CloudflareProvisioningClient({
      accountId: 'conta',
      token: 'teste',
      fetchImpl: fakeFetch,
    });
    await assert.rejects(
      github.createPrivateRepository({ name: 'repo', description: 'x' }),
      (error: unknown) =>
        error instanceof GitHubProvisioningError && !error.message.includes('segredo-no-corpo'),
    );
    await assert.rejects(
      cloudflare.createPagesProject({
        projectName: 'repo',
        repository,
        githubOwner: 'dadocruz',
        productionBranch: 'main',
      }),
      (error: unknown) =>
        error instanceof CloudflareProvisioningError && !error.message.includes('segredo-no-corpo'),
    );
  });
});

describe('credenciais separadas da fábrica', () => {
  it('carrega GitHub, Cloudflare e account_id de arquivos protegidos', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'provisioning-credentials-'));
    const githubPath = join(directory, 'github');
    const cloudflarePath = join(directory, 'cloudflare');
    const accountPath = join(directory, 'account-id');
    await writeFile(githubPath, 'github-valor-teste\n', { mode: 0o600 });
    await writeFile(cloudflarePath, 'cloudflare-valor-teste\n', { mode: 0o600 });
    await writeFile(accountPath, 'conta-teste\n', { mode: 0o600 });

    try {
      const credentials = await loadProvisioningCredentials({
        GITHUB_PROVISION_TOKEN_PATH: githubPath,
        CLOUDFLARE_PROVISION_TOKEN_PATH: cloudflarePath,
        CLOUDFLARE_ACCOUNT_ID_PATH: accountPath,
      });
      assert.deepEqual(credentials, {
        githubToken: 'github-valor-teste',
        cloudflareToken: 'cloudflare-valor-teste',
        cloudflareAccountId: 'conta-teste',
      });
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it('não reutiliza token somente leitura quando o token de escrita falta', async () => {
    await assert.rejects(
      loadProvisioningCredentials({
        GITHUB_TOKEN: 'leitor-github',
        CLOUDFLARE_API_TOKEN: 'leitor-cloudflare',
        CLOUDFLARE_ACCOUNT_ID: 'conta-teste',
        GITHUB_PROVISION_TOKEN_PATH: '/arquivo-inexistente/github',
        CLOUDFLARE_PROVISION_TOKEN_PATH: '/arquivo-inexistente/cloudflare',
      }),
      /GITHUB_PROVISION_TOKEN não configurado/,
    );
  });
});
