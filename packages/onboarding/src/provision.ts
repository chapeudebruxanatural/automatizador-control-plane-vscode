import { loadConfig, type RawEnv } from '../../shared/src/config.js';
import type { CloudflareProvisioningClient } from './cloudflare-provisioning.js';
import type { GitHubProvisioningClient } from './github-provisioning.js';
import { buildStaticStarterFiles } from './starter.js';
import type {
  ClientProvisioningPlan,
  ProvisionedPagesProject,
  ProvisionedRepository,
} from './types.js';

export interface ProvisioningDependencies {
  readonly github: Pick<GitHubProvisioningClient, 'createPrivateRepository' | 'seedFiles'>;
  readonly cloudflare: Pick<CloudflareProvisioningClient, 'createPagesProject' | 'addPagesDomain'>;
}

export interface ProvisioningResult {
  readonly mode: 'dry-run' | 'live';
  readonly plan: ClientProvisioningPlan;
  readonly repository: ProvisionedRepository | null;
  readonly pagesProject: ProvisionedPagesProject | null;
  readonly customDomainAdded: boolean;
}

function assertLiveApproval(
  plan: ClientProvisioningPlan,
  env: RawEnv,
  confirmation: string | undefined,
): void {
  const config = loadConfig(env);
  if (config.killSwitch || config.executionMode !== 'live') {
    throw new Error('provisionamento bloqueado: kill switch ligado ou modo diferente de live');
  }
  if (!config.requireHumanApproval) {
    throw new Error('provisionamento bloqueado: aprovação humana precisa permanecer exigida');
  }
  if (confirmation !== plan.confirmationPhrase) {
    throw new Error(`confirmação inválida; esperado: ${plan.confirmationPhrase}`);
  }
}

export async function provisionClientProject(options: {
  readonly plan: ClientProvisioningPlan;
  readonly apply: boolean;
  readonly confirmation?: string;
  readonly env?: RawEnv;
  readonly dependencies?: ProvisioningDependencies;
}): Promise<ProvisioningResult> {
  if (!options.apply) {
    return {
      mode: 'dry-run',
      plan: options.plan,
      repository: null,
      pagesProject: null,
      customDomainAdded: false,
    };
  }

  assertLiveApproval(options.plan, options.env ?? process.env, options.confirmation);
  if (options.dependencies === undefined) throw new Error('dependências de provisionamento ausentes');

  const repository = await options.dependencies.github.createPrivateRepository({
    name: options.plan.github.repository,
    description: `Projeto de ${options.plan.client.name} administrado pela AutomatizadorIA`,
  });
  const pagesProject = await options.dependencies.cloudflare.createPagesProject({
    projectName: options.plan.cloudflare.projectName,
    repository,
    githubOwner: options.plan.github.owner,
    productionBranch: options.plan.github.productionBranch,
  });
  await options.dependencies.github.seedFiles(
    repository.name,
    options.plan.github.productionBranch,
    buildStaticStarterFiles(options.plan, repository, pagesProject),
  );

  const domain = options.plan.cloudflare.customDomain;
  if (domain !== null) {
    await options.dependencies.cloudflare.addPagesDomain(pagesProject.name, domain);
  }

  return {
    mode: 'live',
    plan: options.plan,
    repository,
    pagesProject,
    customDomainAdded: domain !== null,
  };
}
