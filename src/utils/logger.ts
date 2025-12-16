/**
 * Simple Console Logger for SMTP Demo
 *
 * Provides structured logging with timestamps and levels.
 * Designed for clear demo output to show CTO.
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

interface LogContext {
  [key: string]: unknown;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatContext(context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) return '';

  const parts = Object.entries(context).map(([key, value]) => {
    // Truncate long values for readability
    const strValue = typeof value === 'string' && value.length > 30
      ? value.substring(0, 27) + '...'
      : String(value);
    return `${key}=${strValue}`;
  });

  return ` [${parts.join(', ')}]`;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  const timestamp = formatTimestamp();
  const contextStr = formatContext(context);
  const output = `[${timestamp}] [${level}] ${message}${contextStr}`;

  switch (level) {
    case LogLevel.ERROR:
      console.error(output);
      break;
    case LogLevel.WARN:
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const Logger = {
  debug(message: string, context?: LogContext): void {
    log(LogLevel.DEBUG, message, context);
  },

  info(message: string, context?: LogContext): void {
    log(LogLevel.INFO, message, context);
  },

  warn(message: string, context?: LogContext): void {
    log(LogLevel.WARN, message, context);
  },

  error(message: string, context?: LogContext): void {
    log(LogLevel.ERROR, message, context);
  },

  // Special logging for auth steps (detailed for demo)
  authStep(step: string, result: 'OK' | 'FAIL' | 'FOUND' | 'NOT_FOUND'): void {
    const icon = result === 'OK' || result === 'FOUND' ? '✓' : '✗';
    log(LogLevel.INFO, `Auth step: ${step}... ${icon} ${result}`);
  },

  // Special logging for SMTP commands
  smtpCommand(command: string, args?: string): void {
    log(LogLevel.DEBUG, `SMTP Command: ${command}${args ? ' ' + args : ''}`);
  },

  // Special logging for SMTP responses
  smtpResponse(code: number, enhanced: string, message: string): void {
    const level = code >= 500 ? LogLevel.WARN : code >= 400 ? LogLevel.WARN : LogLevel.INFO;
    log(level, `SMTP Response: ${code} ${enhanced} ${message}`);
  }
};

export default Logger;
