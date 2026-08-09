#!/usr/bin/env node

import { CloudflareProvisioningClient } from '../packages/onboarding/src/cloudflare-provisioning.js';
import { loadProvisioningCredentials } from '../packages/onboarding/src/credentials.js';
import { GitHubProvisioningClient } from '../packages/onboarding/src/github-provisioning.js';
import { buildClientProvisioningPlan } from '../packages/onboarding/src/plan.js';
import { provisionClientProject } from '../packages/onboarding/src/provision.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

const name = argument('--nome');
const slug = argument('--slug');

if (name === undefined || slug === undefined) {
  process.stderr.write(
    'Uso: npm run cliente:provisionar -- --nome <nome> --slug <slug> ' +
      '[--repositorio <nome>] [--projeto-cloudflare <nome>] [--dominio <domínio>] ' +
      '[--aplicar --confirmar "APROVAR ONBOARDING <id>"]\n',
  );
  process.exitCode = 2;
} else {
  try {
    const repositoryName = argument('--repositorio');
    const cloudflareProjectName = argument('--projeto-cloudflare');
    const customDomain = argument('--dominio');
    const plan = buildClientProvisioningPlan({
      clientName: name,
      clientSlug: slug,
      ...(repositoryName === undefined ? {} : { repositoryName }),
      ...(cloudflareProjectName === undefined ? {} : { cloudflareProjectName }),
      ...(customDomain === undefined ? {} : { customDomain }),
    });
    const apply = flag('--aplicar');

    if (!apply) {
      const result = await provisionClientProject({ plan, apply: false });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      const credentials = await loadProvisioningCredentials();
      const result = await provisionClientProject({
        plan,
        apply: true,
        confirmation: argument('--confirmar'),
        dependencies: {
          github: new GitHubProvisioningClient({
            owner: plan.github.owner,
            token: credentials.githubToken,
          }),
          cloudflare: new CloudflareProvisioningClient({
            accountId: credentials.cloudflareAccountId,
            token: credentials.cloudflareToken,
          }),
        },
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`ERRO: ${error instanceof Error ? error.message : 'falha desconhecida'}\n`);
    process.exitCode = 1;
  }
}
