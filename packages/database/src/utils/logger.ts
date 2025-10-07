// Temporary logger utility until @fastbreak/monitoring is available
export interface LoggerConfig {
  serviceName: string;
}

export interface Logger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

export function createLogger(config: LoggerConfig): Logger {
  const serviceName = config.serviceName;
  
  const formatMessage = (level: string, message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${serviceName}] ${message}${metaStr}`;
  };

  return {
    info: (message: string, meta?: any) => {
      console.log(formatMessage('info', message, meta));
    },
    warn: (message: string, meta?: any) => {
      console.warn(formatMessage('warn', message, meta));
    },
    error: (message: string, meta?: any) => {
      console.error(formatMessage('error', message, meta));
    },
    debug: (message: string, meta?: any) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(formatMessage('debug', message, meta));
      }
    }
  };
}