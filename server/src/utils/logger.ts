type LogMeta = Record<string, unknown> | unknown;

const writeLog = (level: 'info' | 'warn' | 'error', message: string, meta?: LogMeta) => {
  const timestamp = new Date().toISOString();

  if (meta !== undefined) {
    console[level](`[${timestamp}] ${level.toUpperCase()}: ${message}`, meta);
    return;
  }

  console[level](`[${timestamp}] ${level.toUpperCase()}: ${message}`);
};

const logger = {
  info: (message: string, meta?: LogMeta) => writeLog('info', message, meta),
  warn: (message: string, meta?: LogMeta) => writeLog('warn', message, meta),
  error: (message: string, meta?: LogMeta) => writeLog('error', message, meta),
};

export { logger };
export default logger;
