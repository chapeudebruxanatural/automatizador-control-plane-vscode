import { createHash } from 'node:crypto';

import {
  clientProvisioningInputSchema,
  type ClientProvisioningInput,
  type ClientProvisioningPlan,
} from './types.js';

export function buildClientProvisioningPlan(
  input: ClientProvisioningInput,
): ClientProvisioningPlan {
  const parsed = clientProvisioningInputSchema.parse(input);
  const repository = parsed.repositoryName ?? parsed.clientSlug;
  const projectName = parsed.cloudflareProjectName ?? repository;
  const canonical = [
    parsed.clientSlug,
    `${parsed.githubOwner}/${repository}`,
    `pages:${projectName}`,
    parsed.customDomain ?? '-',
  ].join('|');
  const planId = createHash('sha256').update(canonical).digest('hex').slice(0, 12);

  return {
    planId,
    client: { name: parsed.clientName, slug: parsed.clientSlug },
    github: {
      owner: parsed.githubOwner,
      repository,
      visibility: 'private',
      productionBranch: parsed.productionBranch,
    },
    cloudflare: {
      kind: 'pages',
      projectName,
      customDomain: parsed.customDomain ?? null,
    },
    template: parsed.template,
    orderedSteps: [
      'github.repository.create',
      'cloudflare.pages.project.create',
      'github.repository.seed',
      'cloudflare.pages.domain.add-if-requested',
    ],
    confirmationPhrase: `APROVAR ONBOARDING ${planId}`,
  };
}
