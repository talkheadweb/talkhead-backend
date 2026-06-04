import winston from 'winston'
import { DefaultLogService, TServiceCode } from './types'
import { baseLogger } from './utils'


export class CustomLogger {
    private base: winston.Logger
    private svc: TServiceCode
    constructor(service?: TServiceCode) {
        this.svc = service || DefaultLogService
        this.base = baseLogger.child({ service: this.svc })
    }
    child(service: TServiceCode) {
        return new CustomLogger(service)
    }
    info(message: any, meta?: Record<string, any>) {
        this.base.info(message, { service: this.svc, ...(meta || {}) })
    }
    warn(message: any, meta?: Record<string, any>) {
        this.base.warn(message, { service: this.svc, ...(meta || {}) })
    }
    error(errOrMsg: any, meta?: Record<string, any>) {
        if (errOrMsg instanceof Error) {
            this.base.error(errOrMsg.message, { service: this.svc, ...(meta || {}), stack: errOrMsg.stack })
        } else {
            this.base.error(errOrMsg, { service: this.svc, ...(meta || {}) })
        }
    }
    http(message: any, meta?: Record<string, any>) {
        this.base.http(message, { service: this.svc, ...(meta || {}) })
    }
    debug(message: any, meta?: Record<string, any>) {
        this.base.debug(message, { service: this.svc, ...(meta || {}) })
    }
    verbose(message: any, meta?: Record<string, any>) {
        this.base.verbose(message, { service: this.svc, ...(meta || {}) })
    }
    silly(message: any, meta?: Record<string, any>) {
        this.base.silly(message, { service: this.svc, ...(meta || {}) })
    }
}
