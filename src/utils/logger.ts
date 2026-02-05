/**
 * Structured logging with pino
 */

import pino from 'pino';

type PinoLogger = pino.Logger;

let loggerInstance: PinoLogger | null = null;

export function createLogger(level: string = 'info'): PinoLogger {
  if (loggerInstance) {
    return loggerInstance;
  }

  loggerInstance = pino.default({
    level,
    transport: {
      target: 'pino/file',
      options: { destination: 2 }, // stderr for MCP compatibility
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  return loggerInstance;
}

export function getLogger(): PinoLogger {
  if (!loggerInstance) {
    return createLogger();
  }
  return loggerInstance;
}

export type Logger = PinoLogger;
