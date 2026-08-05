/**
 * Ponto de entrada da API. Monta as dependências e sobe o servidor.
 *
 * Escuta apenas em `127.0.0.1`: a API não tem autenticação, e o endereço de
 * escuta é a única coisa que a protege hoje.
 */

import { loadConfig } from '../../../packages/shared/src/config.js';
import { createLogger } from '../../../packages/shared/src/logger.js';
import { createDefaultRegistry } from '../../../packages/domain/src/actions.js';
import { createMockAdapterSet } from '../../../packages/integrations/src/adapters/mock.js';
import {
  createMemoryAuditProvider,
  createFileAuditProvider,
  createCompositeAuditProvider,
  type AuditProvider,
} from '../../../packages/audit/src/audit.js';
import { createApiServer } from './server.js';

const HOST = '127.0.0.1';

function main(): void {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, service: config.serviceName });

  const adapters = createMockAdapterSet();
  const registry = createDefaultRegistry(adapters);

  const audit: AuditProvider =
    config.auditSink === 'file'
      ? createCompositeAuditProvider([
          createMemoryAuditProvider(),
          createFileAuditProvider(config.auditLogPath),
        ])
      : createMemoryAuditProvider();

  const { server, readiness } = createApiServer({ config, logger, registry });

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

main();
