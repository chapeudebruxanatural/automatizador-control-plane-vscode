import { stringify } from 'yaml';

import type {
  ClientProvisioningPlan,
  ProvisionedPagesProject,
  ProvisionedRepository,
  StarterFile,
} from './types.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildStaticStarterFiles(
  plan: ClientProvisioningPlan,
  repository: ProvisionedRepository,
  pages: ProvisionedPagesProject,
): readonly StarterFile[] {
  const manifest = stringify({
    schemaVersion: 1,
    client: {
      slug: plan.client.slug,
      name: plan.client.name,
      verificationStatus: 'owner_reported',
    },
    project: {
      repository: `${plan.github.owner}/${repository.name}`,
      repositoryVerificationStatus: 'verified',
      cloudflarePagesProject: pages.name,
      cloudflarePagesVerificationStatus: 'verified',
      pagesSubdomain: pages.subdomain,
      customDomain: plan.cloudflare.customDomain,
    },
    boundaries: {
      secretsAllowed: false,
      executionAuthority: 'dadocruz/automatizador-control-plane',
    },
  });
  const name = escapeHtml(plan.client.name);

  return [
    {
      path: 'index.html',
      content: `<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <title>${name}</title>\n</head>\n<body>\n  <main>\n    <h1>${name}</h1>\n    <p>Projeto inicial criado pela AutomatizadorIA.</p>\n  </main>\n</body>\n</html>\n`,
    },
    { path: '_headers', content: '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n' },
    { path: '.gitignore', content: '.env\n.env.*\n!.env.example\nnode_modules/\ndist/\n.wrangler/\n' },
    { path: 'CLIENTE.yaml', content: manifest },
    {
      path: 'AGENTS.md',
      content: '# AGENTS\n\nLeia `CLIENTE.yaml` antes de agir. Não invente associações e nunca versione segredos. A execução externa pertence ao control plane.\n',
    },
    {
      path: 'CLAUDE.md',
      content: '# CLAUDE\n\nLeia `CLIENTE.yaml` e `AGENTS.md`. Trabalhe somente neste cliente. Não altere Cloudflare, domínio ou produção sem aprovação explícita.\n',
    },
    {
      path: '.github/copilot-instructions.md',
      content: 'Leia `CLIENTE.yaml` e `AGENTS.md`. Não inclua segredos, não misture clientes e mantenha deploy externo atrás de aprovação.\n',
    },
  ];
}
