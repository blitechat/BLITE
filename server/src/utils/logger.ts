// Simple structured logger for better debugging

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const currentLevel = process.env.LOG_LEVEL
  ? parseInt(process.env.LOG_LEVEL, 10)
  : LogLevel.INFO;

function log(level: LogLevel, category: string, message: string, meta?: any): void {
  if (level < currentLevel) return;

  const timestamp = new Date().toISOString();
  const levelName = LogLevel[level];
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';

  console.log(`[${timestamp}] [${levelName}] [${category}] ${message}${metaStr}`);
}

export const logger = {
  debug: (category: string, message: string, meta?: any) =>
    log(LogLevel.DEBUG, category, message, meta),

  info: (category: string, message: string, meta?: any) =>
    log(LogLevel.INFO, category, message, meta),

  warn: (category: string, message: string, meta?: any) =>
    log(LogLevel.WARN, category, message, meta),

  error: (category: string, message: string, meta?: any) =>
    log(LogLevel.ERROR, category, message, meta),
};
