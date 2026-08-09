/**
 * Cliente SSH somente leitura para a VPS.
 *
 * O chamador escolhe uma operação tipada, nunca um comando. Cada operação tem
 * um comando remoto fixo neste arquivo; não existe API para executar texto
 * arbitrário, `docker inspect`, `exec` ou qualquer verbo mutante.
 */

import { execFile } from 'node:child_process';

import type { ContainerSummary, HostSummary } from '../ports/adapters.js';

export type VpsReadOperation = 'host' | 'containers' | 'stacks';
export type SshReadRunner = (alias: string, operation: VpsReadOperation) => Promise<string>;

const SSH_OPTIONS = [
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=15',
  '-o',
  'StrictHostKeyChecking=yes',
] as const;

export const VPS_READ_COMMANDS: Readonly<Record<VpsReadOperation, string>> = {
  host: [
    "printf 'HOSTNAME='; hostname",
    "printf 'OS='; . /etc/os-release; printf '%s %s\\n' \"$NAME\" \"$VERSION_ID\"",
    "printf 'UPTIME_DAYS='; awk '{printf \"%d\\n\",$1/86400}' /proc/uptime",
    "free -m | awk '/^Mem:/ {printf \"MEM_TOTAL_MB=%s\\nMEM_AVAILABLE_MB=%s\\n\",$2,$7}'",
    "df -P / | awk 'NR==2 {gsub(\"%\",\"\",$5); printf \"DISK_USAGE_PERCENT=%s\\n\",$5}'",
  ].join('; '),
  containers: "docker ps -a --format '{{.Names}}\\t{{.Image}}\\t{{.State}}\\t{{.Status}}'",
  stacks: "docker stack ls --format '{{.Name}}'",
};

export class VpsReadError extends Error {
  constructor(readonly operation: VpsReadOperation | 'parse') {
    super(`VPS não concluiu a operação somente leitura: ${operation}`);
    this.name = 'VpsReadError';
  }
}

function runSsh(alias: string, operation: VpsReadOperation): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'ssh',
      [...SSH_OPTIONS, alias, VPS_READ_COMMANDS[operation]],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(new VpsReadError(operation));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

const aliasPattern = /^(?!-)[A-Za-z0-9_.-]+$/;

function parseInteger(values: ReadonlyMap<string, string>, key: string): number {
  const parsed = Number.parseInt(values.get(key) ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new VpsReadError('parse');
  return parsed;
}

function parseHost(raw: string): HostSummary {
  const values = new Map<string, string>();
  for (const line of raw.split('\n')) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    values.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  const hostname = values.get('HOSTNAME') ?? '';
  const os = values.get('OS') ?? '';
  if (hostname === '' || os === '') throw new VpsReadError('parse');
  return {
    hostname,
    os,
    uptimeDays: parseInteger(values, 'UPTIME_DAYS'),
    memoryTotalMb: parseInteger(values, 'MEM_TOTAL_MB'),
    memoryAvailableMb: parseInteger(values, 'MEM_AVAILABLE_MB'),
    diskUsagePercent: parseInteger(values, 'DISK_USAGE_PERCENT'),
  };
}

function parseContainers(raw: string): readonly ContainerSummary[] {
  if (raw.trim() === '') return [];
  return raw
    .trim()
    .split('\n')
    .map((line) => {
      const [name, image, state, status] = line.split('\t');
      if (!name || !image || !state || !status) throw new VpsReadError('parse');
      return {
        name,
        image,
        state,
        stack: null,
        healthy: status.includes('(healthy)')
          ? true
          : status.includes('(unhealthy)')
            ? false
            : null,
      };
    });
}

export interface VpsReadClientOptions {
  readonly alias: string;
  readonly runner?: SshReadRunner;
}

export class VpsReadClient {
  readonly alias: string;
  private readonly runner: SshReadRunner;

  constructor(options: VpsReadClientOptions) {
    const alias = options.alias.trim();
    if (!aliasPattern.test(alias)) throw new Error('alias SSH da VPS inválido');
    this.alias = alias;
    this.runner = options.runner ?? runSsh;
  }

  private async execute(operation: VpsReadOperation): Promise<string> {
    try {
      return await this.runner(this.alias, operation);
    } catch {
      throw new VpsReadError(operation);
    }
  }

  async getHost(): Promise<HostSummary> {
    return parseHost(await this.execute('host'));
  }

  async listContainers(): Promise<readonly ContainerSummary[]> {
    return parseContainers(await this.execute('containers'));
  }

  async listStacks(): Promise<readonly string[]> {
    const raw = await this.execute('stacks');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
}
