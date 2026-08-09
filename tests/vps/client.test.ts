import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createVpsReadAdapter } from '../../packages/integrations/src/vps/adapter.js';
import {
  VPS_READ_COMMANDS,
  VpsReadClient,
  VpsReadError,
  type SshReadRunner,
  type VpsReadOperation,
} from '../../packages/integrations/src/vps/client.js';

const hostResponse = [
  'HOSTNAME=automatizadoria',
  'OS=Debian GNU/Linux 12',
  'UPTIME_DAYS=123',
  'MEM_TOTAL_MB=8192',
  'MEM_AVAILABLE_MB=4096',
  'DISK_USAGE_PERCENT=44',
  '',
].join('\n');

describe('cliente VPS somente leitura', () => {
  it('expõe apenas três operações fixas e nenhuma aceita comando arbitrário', () => {
    assert.deepEqual(Object.keys(VPS_READ_COMMANDS).sort(), ['containers', 'host', 'stacks']);
    for (const command of Object.values(VPS_READ_COMMANDS)) {
      assert.doesNotMatch(command, /docker\s+(exec|inspect|restart|rm)|systemctl\s+restart|\brm\s/);
    }
  });

  it('interpreta host, contêineres e stacks sem ler ambiente ou labels', async () => {
    const operations: VpsReadOperation[] = [];
    const runner: SshReadRunner = (_alias, operation) => {
      operations.push(operation);
      if (operation === 'host') return Promise.resolve(hostResponse);
      if (operation === 'containers') {
        return Promise.resolve(
          'n8n_n8n_editor\tn8nio/n8n:latest\trunning\tUp 2 hours (healthy)\n' +
            'job_antigo\timagem:v1\texited\tExited (0) 1 day ago\n',
        );
      }
      return Promise.resolve('n8n\ntraefik\n');
    };
    const client = new VpsReadClient({ alias: 'nvvps', runner });

    assert.deepEqual(await client.getHost(), {
      hostname: 'automatizadoria',
      os: 'Debian GNU/Linux 12',
      uptimeDays: 123,
      memoryTotalMb: 8192,
      memoryAvailableMb: 4096,
      diskUsagePercent: 44,
    });
    assert.deepEqual(await client.listContainers(), [
      {
        name: 'n8n_n8n_editor',
        image: 'n8nio/n8n:latest',
        state: 'running',
        stack: null,
        healthy: true,
      },
      {
        name: 'job_antigo',
        image: 'imagem:v1',
        state: 'exited',
        stack: null,
        healthy: null,
      },
    ]);
    assert.deepEqual(await client.listStacks(), ['n8n', 'traefik']);
    assert.deepEqual(operations, ['host', 'containers', 'stacks']);
  });

  it('recusa alias que possa injetar opção ou comando', () => {
    assert.throws(() => new VpsReadClient({ alias: 'nvvps; reboot' }), /inválido/);
    assert.throws(() => new VpsReadClient({ alias: '--proxy-command' }), /inválido/);
  });

  it('não inclui saída potencialmente sensível do SSH no erro', async () => {
    const client = new VpsReadClient({
      alias: 'nvvps',
      runner: () => Promise.reject(new Error('segredo-potencial-no-stderr')),
    });
    await assert.rejects(
      client.getHost(),
      (error: unknown) =>
        error instanceof VpsReadError && !error.message.includes('segredo-potencial-no-stderr'),
    );
  });

  it('adaptador não expõe reinício, execução ou remoção', async () => {
    const adapter = createVpsReadAdapter(
      new VpsReadClient({
        alias: 'nvvps',
        runner: (_alias, operation) =>
          Promise.resolve(
            operation === 'host' ? hostResponse : operation === 'containers' ? '' : 'n8n\n',
          ),
      }),
    );
    assert.equal((await adapter.getHost()).hostname, 'automatizadoria');
    assert.equal('restartContainer' in adapter, false);
    assert.equal('exec' in adapter, false);
    assert.equal('removeContainer' in adapter, false);
  });
});
