import fs from 'fs';
import path from 'path';
import winston from "winston";
import DailyRotateFile from 'winston-daily-rotate-file';
import { CustomLogger } from ".";
import envConfig from "..";
import { ENodeEnv } from "../utils/config.types";
import { DefaultLogService, ServiceList, TServiceCode } from "./types";

const isDev = envConfig.node_env === ENodeEnv.DEV
const level = () => (isDev ? 'debug' : 'http')

export const baseLogger = winston.createLogger({
    level: level(),
    defaultMeta: { service: DefaultLogService },
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        verbose: 4,
        debug: 5,
        silly: 6,
    },
    format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ level, message, timestamp, stack, service, ...meta }) => {
            const svc = service || DefaultLogService
            const base = `${timestamp} [${svc}] ${level}: ${message}`
            const extra = Object.keys(meta).length ? ` -> ${JSON.stringify(meta)}` : ''
            return stack ? `${base}\n${stack}${extra}` : `${base}${extra}`
        })
    ),
    transports: [new winston.transports.Console()],
})

const currentDate = new Date().toISOString().slice(0, 10)

const logsRoot = path.resolve(process.cwd(), envConfig.application_log_config.log_dir);
if (!fs.existsSync(logsRoot)) fs.mkdirSync(logsRoot, { recursive: true });
const globalCombinedDir = path.join(logsRoot, currentDate, 'combined');
const globalErrorDir = path.join(logsRoot, currentDate, 'error');
if (!fs.existsSync(globalCombinedDir)) fs.mkdirSync(globalCombinedDir, { recursive: true });
if (!fs.existsSync(globalErrorDir)) fs.mkdirSync(globalErrorDir, { recursive: true });

const maxSize = envConfig.application_log_config.max_size



const globalCombined = new DailyRotateFile({
    dirname: globalCombinedDir,
    filename: 'log',
    extension: '.txt',
    maxSize,
    maxFiles: envConfig.application_log_config.max_files,
    level: envConfig.application_log_config.log_level,
    format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.timestamp(),
        winston.format.json(),
    )
})
const globalError = new DailyRotateFile({
    dirname: globalErrorDir,
    filename: 'log',
    extension: '.txt',
    maxSize,
    maxFiles: envConfig.application_log_config.max_files,
    level: envConfig.application_log_config.error_logs_level,
    format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.timestamp(),
        winston.format.json(),
    )
})
baseLogger.add(globalCombined)
baseLogger.add(globalError)
export const LogService = Object.fromEntries(ServiceList.map(s => [s.code, new CustomLogger(s.code)])) as { [K in TServiceCode]: CustomLogger }
