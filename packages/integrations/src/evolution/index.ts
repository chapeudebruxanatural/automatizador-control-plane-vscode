/**
 * Módulo WhatsApp / Evolution API — ponto de montagem.
 *
 * MÓDULO EM HOMOLOGAÇÃO. `writeActionsEnabled` é sempre `false` neste arquivo
 * — não existe flag de ambiente que o vire `true`. Ligar escrita de verdade
 * exige mudança de código revisada, não apenas configuração, porque este é
 * exatamente o tipo de interruptor que não deveria ser viravel por engano.
 */

export * from './types.js';
export * from './allowlist.js';
export * from './rate-limit.js';
export * from './webhook-auth.js';
export * from './adapter.js';
export * from './client-directory.js';
export * from './command-handler.js';

import type { ActionExecutor } from '../../../domain/src/executor.js';
import type { Logger } from '../../../shared/src/logger.js';
import { createPhoneAllowlist, EMPTY_ALLOWLIST, type PhoneAllowlist } from './allowlist.js';
import { createDeduplicator, createRateLimiter, type Deduplicator, type RateLimiter } from './rate-limit.js';
import { createEmptyClientDirectory, type ClientDirectoryProvider } from './client-directory.js';
import { createCommandHandler } from './command-handler.js';
import { createMockEvolutionAdapter, type EvolutionAdapter } from './adapter.js';
import { maskPhone } from './types.js';
import type { IncomingWhatsAppMessage, CommandResponse } from './types.js';

export const WRITE_ACTIONS_ENABLED = false as const;

export interface WhatsAppModuleConfig {
  readonly allowedNumbers: readonly string[];
  readonly rateLimitPerMinute: number;
  readonly executor: ActionExecutor;
  readonly logger: Logger;
  readonly githubOwner: string;
  readonly clients?: ClientDirectoryProvider;
  readonly adapter?: EvolutionAdapter;
}

export interface WhatsAppModule {
  readonly writeActionsEnabled: false;
  readonly allowlist: PhoneAllowlist;
  readonly rateLimiter: RateLimiter;
  readonly deduplicator: Deduplicator;
  readonly adapter: EvolutionAdapter;
  processIncoming(message: IncomingWhatsAppMessage, correlationId: string): Promise<CommandResponse>;
}

export function createWhatsAppModule(config: WhatsAppModuleConfig): WhatsAppModule {
  const allowlist = config.allowedNumbers.length > 0
    ? createPhoneAllowlist(config.allowedNumbers)
    : EMPTY_ALLOWLIST;
  const rateLimiter = createRateLimiter(config.rateLimitPerMinute, 60_000);
  const deduplicator = createDeduplicator();
  const adapter = config.adapter ?? createMockEvolutionAdapter();
  const clients = config.clients ?? createEmptyClientDirectory();

  const handleCommand = createCommandHandler({
    executor: config.executor,
    clients,
    githubOwner: config.githubOwner,
  });

  return {
    writeActionsEnabled: WRITE_ACTIONS_ENABLED,
    allowlist,
    rateLimiter,
    deduplicator,
    adapter,

    async processIncoming(message, correlationId) {
      const maskedFrom = maskPhone(message.from);

      if (!allowlist.isAllowed(message.from)) {
        config.logger.warn('whatsapp: numero fora da allowlist', { maskedFrom, correlationId });
        return { ok: false, correlationId, text: '' };
      }

      if (!deduplicator.isNew(message.messageId)) {
        config.logger.info('whatsapp: mensagem duplicada ignorada', { maskedFrom, correlationId });
        return { ok: false, correlationId, text: '' };
      }

      if (!rateLimiter.check(message.from)) {
        config.logger.warn('whatsapp: rate limit excedido', { maskedFrom, correlationId });
        return {
          ok: false,
          correlationId,
          text: 'Muitas mensagens em pouco tempo. Aguarde um momento.',
        };
      }

      const [command, ...args] = message.body.trim().toLowerCase().split(/\s+/);

      config.logger.info('whatsapp: comando recebido', {
        maskedFrom,
        command: command ?? '(vazio)',
        correlationId,
      });

      const response = await handleCommand({
        command: command ?? '',
        args,
        correlationId,
        maskedFrom,
      });

      config.logger.info('whatsapp: comando respondido', {
        maskedFrom,
        ok: response.ok,
        correlationId,
      });

      return response;
    },
  };
}
