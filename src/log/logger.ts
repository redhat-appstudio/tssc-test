import { TestInfo } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import pino, { Logger, LoggerOptions } from 'pino';

// Store transport references to allow proper cleanup
const state: {
  loggers: Map<string, Logger>;
  transports: Map<string, pino.TransportMultiOptions | pino.TransportSingleOptions>;
} = {
  loggers: new Map(),
  transports: new Map(),
};

function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9-_.]/g, '_');
}

function createLoggerConfig(logFile: string, template: string) {
  const logDirectory = path.dirname(logFile);
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
  }

  const transport = pino.transport({
    targets: [
      {
        target: 'pino/file',
        options: {
          destination: logFile,
          mkdir: true,
          sync: true, // Make file writes synchronous
        },
        level: 'debug',
      },
      {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          messageFormat: '{time} {template} {levelLabel} {msg}',
          destination: 1, // 1 means process.stdout
        },
        level: 'info',
      },
    ],
  });

  const options: LoggerOptions = {
    level: 'debug',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ levelLabel: label.toUpperCase() }),
      log: (object: Record<string, any>) => ({ template, ...object }),
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };

  return { options, transport };
}

export function createNamedLogger(name: string, template: string): Logger {
  const loggerKey = `${template}-${name}`;
  const existingLogger = state.loggers.get(loggerKey);
  if (existingLogger) return existingLogger;

  try {
    const logDirectory = path.join(process.cwd(), 'test-logs');
    const logFile = path.join(logDirectory, `${sanitizeFilename(name)}.log`);
    const { options, transport } = createLoggerConfig(logFile, template);

    // Store transport for later cleanup
    state.transports.set(loggerKey, transport);

    const logger = pino(options, transport);

    // Add a flush method to the logger
    (logger as any).flush = () => {
      return new Promise<void>(resolve => {
        if ((transport as any).end) {
          (transport as any).end(resolve);
        } else {
          // No explicit end method, assume sync logging will handle it
          resolve();
        }
      });
    };

    state.loggers.set(loggerKey, logger);
    return logger;
  } catch (error) {
    console.error(`Failed to create logger for '${name}' with template '${template}':`, error);
    const fallbackLogger = pino({ name: `fallback-${loggerKey}`, level: 'warn' });
    state.loggers.set(loggerKey, fallbackLogger);
    return fallbackLogger;
  }
}

export function getTestLogger(testInfo: TestInfo, template: string = 'TEST'): Logger {
  const testTitlePath = testInfo.titlePath.slice(1).join(' -- ');
  const loggerName = sanitizeFilename(testTitlePath || 'untitled-test');
  const baseLogger = createNamedLogger(loggerName, template);
  return baseLogger.child({
    testFile: path.basename(testInfo.file),
    retry: testInfo.retry,
    workerIndex: testInfo.workerIndex,
  });
}

export const defaultLogger: Logger = createNamedLogger('global', 'GLOBAL');

// Modified to properly flush logs
export async function closeAllLoggers(): Promise<void> {
  const flushPromises = Array.from(state.loggers.values()).map(logger => {
    if ((logger as any).flush) {
      return (logger as any).flush();
    }
    return Promise.resolve();
  });

  await Promise.all(flushPromises);
  state.loggers.clear();
  state.transports.clear();
}
