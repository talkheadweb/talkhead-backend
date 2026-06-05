import fs from 'fs';
import path from 'path';
import winston from "winston";
import DailyRotateFile from 'winston-daily-rotate-file';
import { CustomLogger } from ".";
import envConfig from "..";
import { ENodeEnv } from "../utils/config.types";
import { DefaultLogService, ServiceList, TServiceCode } from "./types";

const isDev  = envConfig.node_env === ENodeEnv.DEV;
const level  = () => (isDev ? 'debug' : 'http');

// Console transport — colourised for readability in dev/terminal
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack, service, ...meta }) => {
      const svc   = service || DefaultLogService;
      const base  = `${timestamp} [${svc}] ${level}: ${message}`;
      const extra = Object.keys(meta).length ? ` -> ${JSON.stringify(meta)}` : '';
      return stack ? `${base}\n${stack}${extra}` : `${base}${extra}`;
    }),
  ),
});

export const baseLogger = winston.createLogger({
  level: level(),
  defaultMeta: { service: DefaultLogService },
  levels: {
    error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6,
  },
  transports: [consoleTransport],
});

// ── File transports ────────────────────────────────────────────────────────
// Directories are created once at startup; DailyRotateFile handles date-based
// file rotation internally. The directory is fixed — only the filename rotates.
const logsRoot = path.resolve(process.cwd(), envConfig.application_log_config.log_dir);
fs.mkdirSync(path.join(logsRoot, 'combined'), { recursive: true });
fs.mkdirSync(path.join(logsRoot, 'error'),    { recursive: true });

const fileFormat = winston.format.combine(
  winston.format.uncolorize(),
  winston.format.timestamp(),
  winston.format.json(),
);

baseLogger.add(new DailyRotateFile({
  dirname : path.join(logsRoot, 'combined'),
  filename: 'log-%DATE%',
  extension: '.txt',
  datePattern: 'YYYY-MM-DD',
  maxSize : envConfig.application_log_config.max_size,
  maxFiles: envConfig.application_log_config.max_files,
  level   : envConfig.application_log_config.log_level,
  format  : fileFormat,
}));

baseLogger.add(new DailyRotateFile({
  dirname : path.join(logsRoot, 'error'),
  filename: 'log-%DATE%',
  extension: '.txt',
  datePattern: 'YYYY-MM-DD',
  maxSize : envConfig.application_log_config.max_size,
  maxFiles: envConfig.application_log_config.max_files,
  level   : envConfig.application_log_config.error_logs_level,
  format  : fileFormat,
}));

export const LogService = Object.fromEntries(
  ServiceList.map(s => [s.code, new CustomLogger(s.code)])
) as { [K in TServiceCode]: CustomLogger };
