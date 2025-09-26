import winston from 'winston';

export interface LoggerOptions {
  serviceName: string;
  level?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  logDir?: string;
}

export function createLogger(options: LoggerOptions): winston.Logger {
  const { serviceName, level = 'info', enableConsole = true, enableFile = true, logDir = 'logs' } = options;

  const transports: winston.transport[] = [];

  // Console transport
  if (enableConsole) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
          })
        )
      })
    );
  }

  // File transport
  if (enableFile) {
    transports.push(
      new winston.transports.File({
        filename: `${logDir}/${serviceName}-error.log`,
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }),
      new winston.transports.File({
        filename: `${logDir}/${serviceName}-combined.log`,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    );
  }

  const logger = winston.createLogger({
    level,
    defaultMeta: { service: serviceName },
    transports,
    exceptionHandlers: [
      new winston.transports.File({ filename: `${logDir}/${serviceName}-exceptions.log` })
    ],
    rejectionHandlers: [
      new winston.transports.File({ filename: `${logDir}/${serviceName}-rejections.log` })
    ]
  });

  return logger;
}

// Performance logging utilities
export function logPerformance(logger: winston.Logger, operation: string, duration: number, metadata?: any) {
  logger.info('Performance metric', {
    operation,
    duration_ms: duration,
    ...metadata
  });
}

export function createPerformanceTimer(logger: winston.Logger, operation: string) {
  const startTime = Date.now();
  
  return {
    end: (metadata?: any) => {
      const duration = Date.now() - startTime;
      logPerformance(logger, operation, duration, metadata);
      return duration;
    }
  };
}