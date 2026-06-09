import type { Config } from "jest";

const config: Config = {
  preset         : "ts-jest",
  testEnvironment: "node",
  roots          : ["<rootDir>/__tests__"],
  testMatch      : ["**/*.test.ts"],
  setupFiles     : ["<rootDir>/jest.setup.ts"],
  maxWorkers     : "25%",   // cap CPU at ~25% — prevents overloading while keeping tests parallel
  clearMocks     : true,
  forceExit      : true,   // prevents BullMQ/Redis open-handle warnings in tests

  moduleNameMapper: {
    "^@/Config/redis/connection$": "<rootDir>/__tests__/_mocks/redisConnection.ts",
    "^@/Config/logger/utils$"    : "<rootDir>/__tests__/_mocks/loggerUtils.ts",
    "^@/Config/queue$"           : "<rootDir>/__tests__/_mocks/queueConfig.ts",
    "^@/(.*)$"                   : "<rootDir>/src/$1",
  },

  coverageDirectory  : "coverage",
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts",
    "!src/bootstrap.ts",
  ],
};

export default config;
