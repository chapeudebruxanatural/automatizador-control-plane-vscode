import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const CONTEXT_FILES = [
  'profile.yaml',
  'memory.yaml',
  'campaigns.yaml',
  'crm-funnel.yaml',
  'financial-controls.yaml',
  'google-ads.yaml',
  'reporting-spec.yaml',
  'strategy-v2.md',
  'tracking.yaml',
  'backlog.md',
  'decisions.md',
  'environments.yaml',
  'integrations.yaml',
  'marketing-readiness.yaml',
  'operations.md',
  'resources.yaml',
] as const;

const NEVER_EXPORT = ['security.yaml'] as const;

interface ClientIndexEntry {
  readonly slug?: string;
  readonly name?: string;
  readonly kind?: string;
  readonly status?: string;
  readonly verificationStatus?: string;
}

interface ClientIndex {
  readonly clients?: readonly ClientIndexEntry[];
}

export interface ExportClientWorkspaceOptions {
  readonly root: string;
  readonly clientSlug: string;
  readonly destination: string;
  readonly generatedAt?: string;
  readonly repository?: string | null;
}

export interface ExportClientWorkspaceResult {
  readonly clientSlug: string;
  readonly destination: string;
  readonly contextFiles: readonly string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function assertEmptyDestination(destination: string): Promise<void> {
  try {
    const entries = await readdir(destination);
    if (entries.length > 0) {
      throw new Error(`destino não está vazio: ${destination}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function listFiles(root: string, current = root): Promise<readonly string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)));
    if (entry.isFile()) files.push(path.slice(root.length + 1));
  }
  return files.sort();
}

function replaceTemplateVariables(
  content: string,
  values: Readonly<Record<string, string>>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    content,
  );
}

function assertSafeRepositoryReference(repository: string | null | undefined): void {
  if (repository === null || repository === undefined) return;
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) {
    throw new Error('repositório deve usar o formato owner/nome');
  }
}

/**
 * Cria um workspace portátil de um único cliente, sem rede e sem segredos.
 *
 * A lista de contexto é positiva: arquivos novos não entram automaticamente.
 * `security.yaml` é recusado por política mesmo se um dia aparecer na lista.
 */
export async function exportClientWorkspace(
  options: ExportClientWorkspaceOptions,
): Promise<ExportClientWorkspaceResult> {
  const root = resolve(options.root);
  const destination = resolve(options.destination);
  const slug = options.clientSlug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`slug de cliente inválido: ${options.clientSlug}`);
  }
  assertSafeRepositoryReference(options.repository);

  const index = parseYaml(await readFile(join(root, 'clients/index.yaml'), 'utf8')) as ClientIndex;
  const client = (index.clients ?? []).find((candidate) => candidate.slug === slug);
  if (client === undefined || client.name === undefined) {
    throw new Error(`cliente não encontrado no índice: ${slug}`);
  }

  await assertEmptyDestination(destination);
  const templateRoot = join(root, 'templates/client-workspace');
  const templateFiles = await listFiles(templateRoot);
  if (templateFiles.length === 0) throw new Error('template de workspace está vazio');

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const variables = {
    CLIENT_NAME: client.name,
    CLIENT_SLUG: slug,
    GENERATED_AT: generatedAt,
  };

  await mkdir(destination, { recursive: true });
  for (const relative of templateFiles) {
    const source = join(templateRoot, relative);
    const target = join(destination, relative);
    await mkdir(dirname(target), { recursive: true });
    const content = replaceTemplateVariables(await readFile(source, 'utf8'), variables);
    await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
  }

  const clientRoot = join(root, 'clients', slug);
  const contextFiles: string[] = [];
  for (const file of CONTEXT_FILES) {
    if ((NEVER_EXPORT as readonly string[]).includes(file)) continue;
    const source = join(clientRoot, file);
    if (!(await exists(source))) continue;
    const target = join(destination, 'context', file);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { errorOnExist: true, force: false });
    contextFiles.push(file);
  }

  const manifest = {
    schemaVersion: 1,
    client: {
      slug,
      name: client.name,
      kind: client.kind ?? 'unknown',
      status: client.status ?? 'unknown',
      verificationStatus: client.verificationStatus ?? 'unknown',
    },
    workspace: {
      repository: options.repository ?? null,
      repositoryVerificationStatus: 'unknown',
      visibilityRequired: 'private',
    },
    source: {
      controlPlaneRepository: 'dadocruz/automatizador-control-plane',
      path: `clients/${slug}`,
      generatedAt,
      contextFiles,
      excludedSensitiveFiles: [...NEVER_EXPORT],
    },
  };
  await writeFile(join(destination, 'CLIENTE.yaml'), stringifyYaml(manifest), {
    encoding: 'utf8',
    flag: 'wx',
  });

  return { clientSlug: slug, destination, contextFiles };
}

export function formatWorkspaceSummary(result: ExportClientWorkspaceResult): string {
  return [
    `Workspace criado para ${result.clientSlug}.`,
    `Destino: ${result.destination}`,
    `Contexto exportado: ${result.contextFiles.length} arquivo(s).`,
    `Arquivo sensível excluído por política: ${basename(NEVER_EXPORT[0])}.`,
  ].join('\n');
}
