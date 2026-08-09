/**
 * Ponto de entrada da API. Monta as dependências e sobe o servidor.
 *
 * Escuta apenas em `127.0.0.1`: a API não tem autenticação, e o endereço de
 * escuta é a única coisa que a protege hoje.
 */

import { loadConfig } from '../../../packages/shared/src/config.js';
import { createLogger } from '../../../packages/shared/src/logger.js';
import { createDefaultRegistry } from '../../../packages/domain/src/actions.js';
import { ActionExecutor } from '../../../packages/domain/src/executor.js';
import { createMockAdapterSet } from '../../../packages/integrations/src/adapters/mock.js';
import { createCloudflareReadAdapter } from '../../../packages/integrations/src/cloudflare/adapter.js';
import {
  CloudflareReadClient,
  describeCloudflareCredential,
  loadCloudflareApiToken,
} from '../../../packages/integrations/src/cloudflare/client.js';
import { createGitHubReadAdapter } from '../../../packages/integrations/src/github/adapter.js';
import { GitHubReadClient } from '../../../packages/integrations/src/github/client.js';
import { createN8nReadAdapter } from '../../../packages/integrations/src/n8n/adapter.js';
import {
  N8nReadClient,
  describeN8nCredential,
  loadN8nApiKey,
} from '../../../packages/integrations/src/n8n/client.js';
import { createVpsReadAdapter } from '../../../packages/integrations/src/vps/adapter.js';
import { VpsReadClient } from '../../../packages/integrations/src/vps/client.js';
import { createKillSwitch } from '../../../packages/security/src/kill-switch.js';
import { createDenyAllApprovalProvider } from '../../../packages/security/src/approval.js';
import {
  createMemoryAuditProvider,
  createFileAuditProvider,
  createCompositeAuditProvider,
  type AuditProvider,
} from '../../../packages/audit/src/audit.js';
import { createWhatsAppModule } from '../../../packages/integrations/src/evolution/index.js';
import { createApiServer } from './server.js';

const HOST = '127.0.0.1';

function parseAllowedNumbers(raw: string | undefined): readonly string[] {
  return (raw ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, service: config.serviceName });

  const mocks = createMockAdapterSet();
  const githubOwner = process.env['GITHUB_OWNER']?.trim() || 'dadocruz';
  const github =
    process.env['GITHUB_AUTH_MODE']?.trim().toLowerCase() === 'gh-cli'
      ? createGitHubReadAdapter(new GitHubReadClient({ owner: githubOwner }))
      : mocks.github;
  const vpsAlias = process.env['VPS_SSH_ALIAS']?.trim() ?? '';
  const vps =
    process.env['VPS_READ_ONLY']?.trim().toLowerCase() === 'true' && vpsAlias !== ''
      ? createVpsReadAdapter(new VpsReadClient({ alias: vpsAlias }))
      : mocks.vps;
  const cloudflareStatus = await describeCloudflareCredential();
  const cloudflareAccountId = process.env['CLOUDFLARE_ACCOUNT_ID']?.trim() ?? '';
  const cloudflare =
    cloudflareStatus.configured && cloudflareAccountId !== ''
      ? createCloudflareReadAdapter(
          new CloudflareReadClient({
            accountId: cloudflareAccountId,
            token: await loadCloudflareApiToken(),
          }),
        )
      : mocks.cloudflare;
  const n8nStatus = await describeN8nCredential();
  const n8nBaseUrl = process.env['N8N_BASE_URL']?.trim() ?? '';
  const n8n =
    n8nStatus.configured && n8nBaseUrl !== ''
      ? createN8nReadAdapter(
          new N8nReadClient({ baseUrl: n8nBaseUrl, apiKey: await loadN8nApiKey() }),
        )
      : mocks.n8n;
  const adapters = { ...mocks, github, vps, n8n, cloudflare };
  const registry = createDefaultRegistry(adapters);

  const audit: AuditProvider =
    config.auditSink === 'file'
      ? createCompositeAuditProvider([
          createMemoryAuditProvider(),
          createFileAuditProvider(config.auditLogPath),
        ])
      : createMemoryAuditProvider();

  // Sem endpoint de execução de ação nesta fase — o executor existe para o
  // módulo WhatsApp poder responder consultas (status, listagens) pelo mesmo
  // caminho protegido (kill switch + auditoria) usado por qualquer outra ação.
  const executor = new ActionExecutor({
    registry,
    killSwitch: createKillSwitch({ engaged: config.killSwitch }),
    approval: createDenyAllApprovalProvider(),
    audit,
    logger,
    dryRun: config.executionMode === 'dry-run',
  });

  // Mock por padrão: sem EVOLUTION_API_URL/EVOLUTION_API_KEY configurados,
  // não há chamada de rede real. `sendMessage` permanece bloqueado de
  // qualquer forma — ver packages/integrations/src/evolution/adapter.ts.
  const whatsapp = createWhatsAppModule({
    allowedNumbers: parseAllowedNumbers(process.env['WHATSAPP_ALLOWED_NUMBERS']),
    rateLimitPerMinute: Number(process.env['WHATSAPP_RATE_LIMIT_PER_MINUTE'] ?? '20') || 20,
    executor,
    logger: logger.child({ module: 'whatsapp' }),
    githubOwner: process.env['GITHUB_OWNER'] ?? 'dadocruz',
  });

  const webhookSecret = process.env['EVOLUTION_WEBHOOK_SECRET'] ?? '';

  const { server, readiness } = createApiServer({
    config,
    logger,
    registry,
    integrationEnabled: Object.fromEntries(
      Object.entries(adapters).map(([name, adapter]) => [name, adapter.enabled]),
    ),
    whatsapp: { module: whatsapp, webhookSecret, logger: logger.child({ route: 'whatsapp' }) },
  });

  server.listen(config.port, HOST, () => {
    logger.info('control plane no ar', {
      host: HOST,
      port: config.port,
      environment: config.nodeEnv,
      killSwitch: config.killSwitch ? 'engaged' : 'DISENGAGED',
      executionMode: config.executionMode,
      auditSink: audit.name,
      actions: registry.list().length,
      mutatingActions: registry.listMutating().length,
      whatsappWriteActionsEnabled: whatsapp.writeActionsEnabled,
      whatsappAllowlistSize: whatsapp.allowlist.size,
    });

    if (!config.killSwitch) {
      logger.warn(
        'KILL SWITCH DESLIGADO — ações mutantes podem ser executadas. ' +
          'Confirme que há justificativa registrada em DECISIONS.md.',
      );
    }
  });

  const shutdown = (signal: string): void => {
    logger.info('encerrando', { signal });
    readiness.ready = false;
    readiness.reason = `encerrando (${signal})`;
    server.close(() => process.exit(0));
    // Se conexões abertas impedirem o fechamento, não esperar para sempre.
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'erro desconhecido';
  process.stderr.write(`Falha ao iniciar o control plane: ${message}\n`);
  process.exitCode = 1;
});
