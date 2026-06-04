import config from "@/Config/index";
import { Redis } from "ioredis";
import { LogService } from "../logger/utils";
import { RedisManager } from "./redisManager";

const RedisEventClient = new Redis({
    host: config.redis.host,
    port: config.redis.port || 6379,
    password: config.redis.password,
    maxRetriesPerRequest: 1,
    lazyConnect: true
})

const chanel_name = '__keyevent@0__:expired'

// Create retry manager for Redis Event client
const eventRetryManager = new RedisManager({
    maxAttempts: 10,
    clientName: "Redis Event Client",
    baseDelayMs: 1000,  // Start with 1000ms delay
    maxDelayMs: 100000, // Cap at 100 seconds
    onReady: () => {
        // Configure and subscribe to events only after successful connection
        RedisEventClient.config('SET', 'notify-keyspace-events', 'Ex');
        RedisEventClient.subscribe('__keyevent@0__:expired');

        // Set up message handler after connection is ready
        RedisEventClient.on('message', async (channel: string, message: string) => {
            LogService.REDIS.debug('message', { message, channel });
            if (channel === chanel_name) {
                const keys = message.split(':')
                LogService.REDIS.debug('keys', { keys })
                if (keys[0] === 'key name') {
                    //do something
                }
            }
        });
    },
    onMaxAttemptsReached: () => {
        // Don't exit process here as this is for events only, main app can continue
        LogService.REDIS.warn("Redis Event Client disabled due to connection failures. Event-based features may not work.");
    }
});

// Setup retry logic using the centralized manager
eventRetryManager.setupRetryLogic(RedisEventClient);

// Handle initial connection (now async)
(async () => {
    await eventRetryManager.handleInitialConnection(RedisEventClient);
})();

export { RedisEventClient };
