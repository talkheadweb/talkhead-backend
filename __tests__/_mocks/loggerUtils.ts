// Global logger mock — applied to all tests via jest.config.ts moduleNameMapper.
// Every LogService service is a no-op so tests never write files or fail on missing services.

const noop = () =>
  ({
    info   : jest.fn(),
    error  : jest.fn(),
    warn   : jest.fn(),
    debug  : jest.fn(),
    http   : jest.fn(),
    verbose: jest.fn(),
    silly  : jest.fn(),
  }) as any;

export const LogService = {
  NETWORK    : noop(),
  APPLICATION: noop(),
  DATABASE   : noop(),
  REDIS      : noop(),
  AUTH       : noop(),
  SYSTEM     : noop(),
};

export const baseLogger = noop();
export class CustomLogger {}
