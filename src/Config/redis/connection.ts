import config from "@/Config/index";
import { Redis } from "ioredis";
import { LogService } from "../logger/utils";
import { RedisManager } from "./redisManager";

const RedisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port || 6379,
    password: config.redis.password,
    maxRetriesPerRequest: 1,
    lazyConnect: true
})

// Create retry manager for main Redis client
const redisManager = new RedisManager({
    maxAttempts: 10,
    clientName: "Redis Client",
    baseDelayMs: 1000,  // Start with 1000ms delay
    maxDelayMs: 100000, // Cap at 100 seconds
    onConnect: () => {
        // Ping Redis server on successful connection
        RedisClient.ping((err, result) => {
            if (err) {
                LogService.REDIS.error("Redis Ping failed:", err);
            } else {
                LogService.REDIS.debug("Redis Ping response:", { result });
            }
        });
    }
});

// Setup retry logic using the centralized manager
redisManager.setupRetryLogic(RedisClient);

// Handle initial connection (now async)
(async () => {
    await redisManager.handleInitialConnection(RedisClient);
})();

export { RedisClient };
