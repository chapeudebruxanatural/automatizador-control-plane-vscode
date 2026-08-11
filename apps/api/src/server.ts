/**
 * API HTTP mínima.
 *
 * Usa o módulo `http` nativo — sem framework. A justificativa está em
 * `DECISIONS.md`: menos dependência de terceiros no processo que segurará
 * credenciais de produção.
 *
 * A API **não tem autenticação** e escuta apenas em `127.0.0.1`. Isso é
 * suficiente enquanto ela só expõe postura e saúde. Antes de expor qualquer
 * ação, autenticação passa a ser obrigatória.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Config } from '../../../packages/shared/src/config.js';
import { describePosture, type IntegrationEnabledState } from '../../../packages/shared/src/config.js';
import type { Logger } from '../../../packages/shared/src/logger.js';
import type { ActionRegistry } from '../../../packages/domain/src/action.js';
import type { ActionExecutor } from '../../../packages/domain/src/executor.js';
import { handleWhatsAppWebhook, type WhatsAppRouteDependencies } from './routes/whatsapp/webhook.js';

export interface ServerDependencies {
  readonly config: Config;
  readonly logger: Logger;
  readonly registry: ActionRegistry;
  readonly executor?: ActionExecutor;
  /** Injetável para teste. */
  readonly env?: Record<string, string | undefined>;
  readonly integrationEnabled?: IntegrationEnabledState;
  /**
   * Opcional: quando ausente, POST /whatsapp/webhook cai no 405 padrão como
   * qualquer outra rota POST. O módulo em si já é seguro por padrão (ver
   * docs/architecture/whatsapp-evolution.md) — esta flag só decide se a rota
   * existe, não se ela pode escrever.
   */
  readonly whatsapp?: WhatsAppRouteDependencies;
}

export interface ReadinessState {
  ready: boolean;
  reason: string;
}

export function createApiServer(deps: ServerDependencies): {
  server: Server;
  readiness: ReadinessState;
} {
  const { config, logger, registry } = deps;
  const startedAt = Date.now();

  // A prontidão é mutável de propósito: o processo pode subir e só depois ficar
  // apto (ou deixar de ficar). Liveness e readiness respondem a perguntas
  // diferentes, e um único sinal não serve para as duas.
  const readiness: ReadinessState = { ready: true, reason: 'inicializado' };

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    const payload = JSON.stringify(body, null, 2);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(payload);
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const path = (req.url ?? '/').split('?')[0] ?? '/';

    async function readJsonBody(maxBytes = 64 * 1024): Promise<any> {
      return new Promise((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        let received = 0;
        req.on('data', (c: Uint8Array) => {
          received += c.length;
          if (received > maxBytes) {
            reject(new Error('payload_too_large'));
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        req.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8') || '';
            if (raw.trim() === '') return resolve({});
            return resolve(JSON.parse(raw));
          } catch (e) {
            return reject(e);
          }
        });
        req.on('error', (err) => reject(err));
      });
    }

    if (method === 'POST' && path === '/whatsapp/webhook' && deps.whatsapp !== undefined) {
      handleWhatsAppWebhook(req, res, deps.whatsapp).catch((err: unknown) => {
        logger.error('whatsapp: erro nao tratado no webhook', {
          error: err instanceof Error ? err.message : String(err),
        });
        if (!res.headersSent) json(res, 500, { error: 'internal_error' });
      });
      return;
    }

    if (method === 'POST' && path === '/execute') {
      // Secure by token if configured.
      const env = deps.env ?? process.env;
      const token = env['EXECUTION_AUTH_TOKEN'] ?? '';
      const header = (req.headers['x-cp-exec-token'] as string) ?? '';

      if (!deps.executor) {
        json(res, 501, { error: 'not_implemented', detail: 'executor not available' });
        return;
      }

      if (token && token !== header) {
        json(res, 401, { error: 'unauthorized' });
        return;
      }

      try {
        const body = await readJsonBody();
        const { kind, target, payload, clientSlug, requestedBy } = body;
        if (typeof kind !== 'string' || typeof target !== 'string') {
          json(res, 400, { error: 'invalid_request', detail: 'kind and target are required strings' });
          return;
        }

        const result = await deps.executor.execute({ kind, target, payload, clientSlug, requestedBy });
        json(res, 200, { result });
      } catch (err: any) {
        if (err?.message === 'payload_too_large') {
          json(res, 413, { error: 'payload_too_large' });
          return;
        }
        json(res, 500, { error: 'internal_error', detail: err instanceof Error ? err.message : String(err) });
      }

      return;
    }

    if (method !== 'GET') {
      json(res, 405, { error: 'method_not_allowed', detail: 'Somente GET nesta fase, exceto /whatsapp/webhook.' });
      return;
    }

    switch (path) {
      case '/health':
        json(res, 200, {
          status: 'ok',
          service: config.serviceName,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        });
        return;

      case '/ready':
        json(res, readiness.ready ? 200 : 503, {
          status: readiness.ready ? 'ready' : 'not_ready',
          reason: readiness.reason,
          service: config.serviceName,
        });
        return;

      case '/status':
        json(res, 200, {
          service: config.serviceName,
          environment: config.nodeEnv,
          posture: describePosture(
            config,
            deps.env ?? process.env,
            deps.integrationEnabled ?? {},
          ),
          actions: {
            total: registry.list().length,
            mutating: registry.listMutating().length,
            kinds: registry.list().map((d) => ({
              kind: d.kind,
              domain: d.domain,
              mutating: d.mutating,
            })),
          },
        });
        return;

      default:
        json(res, 404, {
          error: 'not_found',
          available: ['/health', '/ready', '/status'],
        });
    }
  });

  server.on('clientError', (err: Error, socket) => {
    logger.warn('erro de cliente HTTP', { error: err.message });
    if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  return { server, readiness };
}
