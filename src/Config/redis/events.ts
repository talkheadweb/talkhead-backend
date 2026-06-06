/*
  Redis keyspace-event client — dedicated pub/sub connection.

  A separate connection is required because a client in subscribe mode cannot
  issue regular commands on the same connection.

  Subscribed to: __keyevent@0__:expired
  Add feature-specific expiry handlers in the `message` listener below.
*/

import config from "@/Config";
import { LogService } from "@/Config/logger/utils";
import { Redis } from "ioredis";

const log     = LogService.REDIS;
const NAME    = "RedisEventClient";
const CHANNEL = "__keyevent@0__:expired";

const RedisEventClient = new Redis({
  host    : config.redis.host,
  port    : config.redis.port,
  password: config.redis.password,
  lazyConnect         : true,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(2 ** (times - 1) * 1_000, 30_000),
});

RedisEventClient.on("connect",      ()    => log.debug(`[${NAME}] connecting`));
RedisEventClient.on("ready",        ()    => log.info (`[${NAME}] ready`));
RedisEventClient.on("error",        (err) => log.error(`[${NAME}] error — ${err.message}`));
RedisEventClient.on("close",        ()    => log.warn (`[${NAME}] connection closed`));
RedisEventClient.on("reconnecting", ()    => log.warn (`[${NAME}] reconnecting…`));
RedisEventClient.on("end",          ()    => log.warn (`[${NAME}] connection ended`));

// Re-subscribe on every (re)connect — subscriptions are dropped on disconnect.
// notify-keyspace-events is configured via --notify-keyspace-events in the
// Redis server command (docker-compose.yml) so no runtime CONFIG SET is needed.
RedisEventClient.on("ready", () => {
  RedisEventClient.subscribe(CHANNEL, (err) => {
    if (err) log.error(`[${NAME}] subscribe failed`, { message: err.message });
    else     log.info (`[${NAME}] subscribed to ${CHANNEL}`);
  });
});

// ── Expiry event handler ───────────────────────────────────────────────────
// Add feature-specific logic here as the app grows.
// The `key` is the full Redis key that just expired, e.g. "auth:verify:userId".
RedisEventClient.on("message", (_channel: string, key: string) => {
  log.debug(`[${NAME}] key expired`, { key });

  // Example pattern:
  // const [domain, type, id] = key.split(":");
  // if (domain === "auth" && type === "verify") { ... }
});

RedisEventClient.connect().catch((err) =>
  log.warn(`[${NAME}] initial connection failed — retrying in background`, { message: err.message })
);

export { RedisEventClient };
