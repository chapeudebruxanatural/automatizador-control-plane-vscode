/**
 * Configuração validada.
 *
 * Regra que governa este arquivo: **falha fechada**. Quando um valor de
 * ambiente é ausente, vazio ou inválido, o resultado é sempre a opção mais
 * restritiva — kill switch ligado, modo `dry-run`, aprovação exigida.
 *
 * Uma variável mal escrita não pode virar permissão de escrita.
 */

import { z } from 'zod';

export const EXECUTION_MODES = ['dry-run', 'live'] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const AUDIT_SINKS = ['memory', 'file'] as const;
export type AuditSink = (typeof AUDIT_SINKS)[number];

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']),
  port: z.number().int().min(0).max(65535),
  logLevel: z.enum(LOG_LEVELS),
  serviceName: z.string().min(1),

  killSwitch: z.boolean(),
  executionMode: z.enum(EXECUTION_MODES),
  requireHumanApproval: z.boolean(),

  auditSink: z.enum(AUDIT_SINKS),
  auditLogPath: z.string().min(1),

  whatsappEnabled: z.literal(false),
});

export type Config = z.infer<typeof configSchema>;

export type RawEnv = Record<string, string | undefined>;

export type IntegrationEnabledState = Partial<
  Readonly<Record<'github' | 'vps' | 'n8n' | 'cloudflare' | 'google' | 'meta' | 'whatsapp', boolean>>
>;

/**
 * Desliga apenas com o literal `false`. Qualquer outra coisa — ausente, vazio,
 * `"no"`, `"0"`, um erro de digitação — mantém o freio acionado.
 */
function parseSafetyFlag(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() !== 'false';
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : fallback;
}

function parseEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = raw?.trim().toLowerCase();
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function loadConfig(env: RawEnv = process.env): Config {
  const executionMode = parseEnum(env['EXECUTION_MODE'], EXECUTION_MODES, 'dry-run');
  const killSwitch = parseSafetyFlag(env['CONTROL_PLANE_KILL_SWITCH']);

  return configSchema.parse({
    nodeEnv: parseEnum(
      env['NODE_ENV'],
      ['development', 'test', 'production'] as const,
      'development',
    ),
    port: parsePort(env['PORT'], 3000),
    logLevel: parseEnum(env['LOG_LEVEL'], LOG_LEVELS, 'info'),
    serviceName: env['SERVICE_NAME']?.trim() || 'control-plane-api',

    killSwitch,
    // `live` só vale de fato com o kill switch desligado. Manter os dois
    // coerentes aqui evita que o resto do código precise lembrar da regra.
    executionMode: killSwitch ? 'dry-run' : executionMode,
    requireHumanApproval: parseSafetyFlag(env['REQUIRE_HUMAN_APPROVAL']),

    auditSink: parseEnum(env['AUDIT_SINK'], AUDIT_SINKS, 'memory'),
    auditLogPath: env['AUDIT_LOG_PATH']?.trim() || './audit/audit.jsonl',

    // Não é configurável nesta fase: ver DECISIONS.md.
    whatsappEnabled: false,
  });
}

/**
 * Postura de segurança para exposição em `/status`.
 * Reporta apenas PRESENÇA de configuração, nunca valores.
 */
export function describePosture(
  config: Config,
  env: RawEnv = process.env,
  enabledState: IntegrationEnabledState = {},
) {
  const configured = (name: string): boolean => {
    const value = env[name];
    return value !== undefined && value.trim() !== '';
  };

  return {
    killSwitch: config.killSwitch ? 'engaged' : 'disengaged',
    executionMode: config.executionMode,
    requireHumanApproval: config.requireHumanApproval,
    whatsappEnabled: config.whatsappEnabled,
    integrations: {
      github: {
        enabled: enabledState.github ?? false,
        credentialConfigured:
          configured('GITHUB_TOKEN') || env['GITHUB_AUTH_MODE']?.trim().toLowerCase() === 'gh-cli',
      },
      vps: { enabled: enabledState.vps ?? false, credentialConfigured: configured('VPS_SSH_ALIAS') },
      n8n: {
        enabled: enabledState.n8n ?? false,
        credentialConfigured: configured('N8N_API_KEY') || configured('N8N_API_KEY_PATH'),
      },
      cloudflare: {
        enabled: enabledState.cloudflare ?? false,
        credentialConfigured:
          configured('CLOUDFLARE_API_TOKEN') || configured('CLOUDFLARE_API_TOKEN_PATH'),
      },
      google: { enabled: enabledState.google ?? false, credentialConfigured: configured('GOOGLE_CLIENT_ID') },
      meta: { enabled: enabledState.meta ?? false, credentialConfigured: configured('META_ACCESS_TOKEN') },
      whatsapp: { enabled: enabledState.whatsapp ?? false, credentialConfigured: configured('WHATSAPP_ACCESS_TOKEN') },
    },
  };
}
