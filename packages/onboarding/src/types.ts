import { z } from 'zod';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const clientProvisioningInputSchema = z.object({
  clientName: z.string().trim().min(2).max(120),
  clientSlug: z.string().trim().regex(slugPattern),
  githubOwner: z.string().trim().regex(slugPattern).default('dadocruz'),
  repositoryName: z.string().trim().regex(slugPattern).optional(),
  cloudflareProjectName: z.string().trim().regex(slugPattern).optional(),
  customDomain: z.string().trim().toLowerCase().regex(domainPattern).optional(),
  productionBranch: z.string().trim().regex(slugPattern).default('main'),
  template: z.literal('static-site').default('static-site'),
});

export type ClientProvisioningInput = z.input<typeof clientProvisioningInputSchema>;

export interface ClientProvisioningPlan {
  readonly planId: string;
  readonly client: {
    readonly name: string;
    readonly slug: string;
  };
  readonly github: {
    readonly owner: string;
    readonly repository: string;
    readonly visibility: 'private';
    readonly productionBranch: string;
  };
  readonly cloudflare: {
    readonly kind: 'pages';
    readonly projectName: string;
    readonly customDomain: string | null;
  };
  readonly template: 'static-site';
  readonly orderedSteps: readonly [
    'github.repository.create',
    'cloudflare.pages.project.create',
    'github.repository.seed',
    'cloudflare.pages.domain.add-if-requested',
  ];
  readonly confirmationPhrase: string;
}

export interface ProvisionedRepository {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly url: string;
  readonly defaultBranch: string;
  readonly visibility: 'private';
}

export interface ProvisionedPagesProject {
  readonly id: string;
  readonly name: string;
  readonly subdomain: string;
}

export interface StarterFile {
  readonly path: string;
  readonly content: string;
}
