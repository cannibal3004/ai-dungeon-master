import winston from 'winston';
import path from 'path';
import fs from 'fs';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
          }`;
        })
      ),
    }),
    // UTF-8 file log to avoid Windows console codepage mangling of smart quotes/apostrophes
    (() => {
      const logDir = path.resolve(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      return new winston.transports.File({
        filename: path.join(logDir, 'backend.log'),
        level: process.env.LOG_LEVEL || 'info',
        format: logFormat,
        options: { flags: 'a', encoding: 'utf8' },
      });
    })(),
  ],
});
