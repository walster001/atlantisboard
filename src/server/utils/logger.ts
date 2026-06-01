import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

function resolveLogLevel(): string {
  const fromEnv = process.env.LOG_LEVEL?.trim();
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }
  return process.env.NODE_ENV === 'test' ? 'warn' : 'info';
}

const logLevel = resolveLogLevel();

const transport = isDevelopment
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export const logger = transport
  ? pino(
      {
        level: logLevel,
        formatters: {
          level: (label) => {
            return { level: label };
          },
        },
      },
      pino.transport(transport)
    )
  : pino({
      level: logLevel,
      formatters: {
        level: (label) => {
          return { level: label };
        },
      },
    });

