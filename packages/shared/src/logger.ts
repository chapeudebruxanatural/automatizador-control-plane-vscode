/**
 * Logger com redação obrigatória.
 *
 * Único lugar do projeto autorizado a escrever em stdout/stderr — o ESLint
 * proíbe `console` em todos os outros arquivos. A razão é simples: se existir
 * mais de um caminho até a saída, um deles vai esquecer de redigir.
 */

import { redact, redactString } from './redact.js';
import type { LogLevel } from './config.js';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogFields {
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly service: string;
  /** Injetável para teste; por padrão escreve em stdout/stderr. */
  readonly sink?: (line: string, level: LogLevel) => void;
}

function defaultSink(line: string, level: LogLevel): void {
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function createLogger(options: LoggerOptions): Logger {
  const sink = options.sink ?? defaultSink;
  const threshold = LEVEL_ORDER[options.level];

  const build = (bindings: LogFields): Logger => {
    const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
      if (LEVEL_ORDER[level] < threshold) return;

      const record = {
        ts: new Date().toISOString(),
        level,
        service: options.service,
        msg: redactString(message),
        ...(redact({ ...bindings, ...fields }) as Record<string, unknown>),
      };

      let line: string;
      try {
        line = JSON.stringify(record);
      } catch {
        // Serialização falhou (getter que lança, BigInt inesperado). Registrar
        // o fato é melhor que perder o evento em silêncio.
        line = JSON.stringify({
          ts: record.ts,
          level,
          service: options.service,
          msg: redactString(message),
          error: 'log_serialization_failed',
        });
      }
      sink(line, level);
    };

    return {
      debug: (m, f) => emit('debug', m, f),
      info: (m, f) => emit('info', m, f),
      warn: (m, f) => emit('warn', m, f),
      error: (m, f) => emit('error', m, f),
      child: (extra) => build({ ...bindings, ...extra }),
    };
  };

  return build({});
}
