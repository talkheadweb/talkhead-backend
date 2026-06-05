/*
  Main Redis client — used for all regular GET / SET / DEL commands.

  Reconnection: ioredis retryStrategy handles exponential backoff automatically.
    1s → 2s → 4s → 8s → 16s → 30s → 30s → …
  Commands issued while disconnected are queued and executed on reconnect
  (maxRetriesPerRequest: null).
*/

import config from "@/Config";
import { LogService } from "@/Config/logger/utils";
import { Redis } from "ioredis";

const log  = LogService.REDIS;
const NAME = "RedisClient";

const RedisClient = new Redis({
  host    : config.redis.host,
  port    : config.redis.port,
  password: config.redis.password,
  lazyConnect         : true,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(2 ** (times - 1) * 1_000, 30_000),
});

RedisClient.on("connect",      ()    => log.debug(`[${NAME}] connecting`));
RedisClient.on("ready",        ()    => log.info (`[${NAME}] ready`));
RedisClient.on("error",        (err) => log.error(`[${NAME}] error — ${err.message}`));
RedisClient.on("close",        ()    => log.warn (`[${NAME}] connection closed`));
RedisClient.on("reconnecting", ()    => log.warn (`[${NAME}] reconnecting…`));
RedisClient.on("end",          ()    => log.warn (`[${NAME}] connection ended`));

// Connect on startup. If Redis isn't available yet, retryStrategy takes over.
RedisClient.connect().catch((err) =>
  log.warn(`[${NAME}] initial connection failed — retrying in background`, { message: err.message })
);

export { RedisClient };
