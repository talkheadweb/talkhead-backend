// Global Redis connection mock — prevents actual connection attempts in all tests.

export const RedisClient = {
  set       : jest.fn().mockResolvedValue("OK"),
  get       : jest.fn().mockResolvedValue(null),
  del       : jest.fn().mockResolvedValue(1),
  ping      : jest.fn().mockResolvedValue("PONG"),
  on        : jest.fn(),
  connect   : jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  expire    : jest.fn().mockResolvedValue(1),
  scan      : jest.fn().mockResolvedValue(["0", []]),
  call      : jest.fn().mockResolvedValue(null),
};
