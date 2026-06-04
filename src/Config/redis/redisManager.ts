import { Redis } from "ioredis";
import { LogService } from "../logger/utils";

export interface RedisRetryConfig {
    maxAttempts: number;
    clientName: string;
    baseDelayMs?: number; // Base delay in milliseconds for exponential backoff (default: 500ms)
    maxDelayMs?: number;  // Maximum delay cap in milliseconds (default: 10000ms)
    onMaxAttemptsReached?: (clientName: string) => void;
    onError?: (clientName: string, attempt: number, maxAttempts: number, error: any) => void;
    onConnect?: (clientName: string) => void;
    onReady?: (clientName: string) => void;
    onClose?: (clientName: string) => void;
}

export class RedisManager {
    private connectionAttempts: number = 0;
    private config: RedisRetryConfig;
    private baseDelayMs: number;
    private maxDelayMs: number;

    constructor(config: RedisRetryConfig) {
        this.config = config;
        this.baseDelayMs = config.baseDelayMs || 1000; // Default 1000ms base delay
        this.maxDelayMs = config.maxDelayMs || 100000;  // Default 10s max delay
    }

    /**
     * Calculate exponential backoff delay
     */
    private calculateDelay(attempt: number): number {
        const delay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
        return delay;
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Setup retry logic for a Redis client
     */
    setupRetryLogic(client: Redis): void {
        // Connect event handler
        client.on("connect", () => {
            LogService.REDIS.debug(`${this.config.clientName} is connecting to Redis server`);
            this.connectionAttempts = 0; // Reset counter on successful connection
            this.config.onConnect?.(this.config.clientName);
        });

        // Ready event handler
        client.on('ready', () => {
            LogService.REDIS.info(`${this.config.clientName} successfully connected to Redis and ready to use`);
            this.connectionAttempts = 0; // Reset counter on ready state
            this.config.onReady?.(this.config.clientName);
        });

        // Error event handler
        client.on("error", (err) => {
            this.connectionAttempts++;
            LogService.REDIS.debug(`${this.config.clientName} connection error (attempt ${this.connectionAttempts}/${this.config.maxAttempts}): ${err.message}`);

            // Custom error handler
            this.config.onError?.(this.config.clientName, this.connectionAttempts, this.config.maxAttempts, err);

            if (this.connectionAttempts > this.config.maxAttempts) {
                LogService.REDIS.warn(`Maximum ${this.config.clientName} connection attempts reached.`);
                client.disconnect();
                LogService.REDIS.warn(`${this.config.clientName} connection closed due to repeated failures. Redis-dependent features may not work.`);

                // Custom max attempts handler
                this.config.onMaxAttemptsReached?.(this.config.clientName);
            }
        });

        // Close event handler
        client.on("close", () => {
            // console.log(`${this.config.clientName} connection closed`);
            this.config.onClose?.(this.config.clientName);
        });
    }

    /**
     * Handle initial connection attempt with delay
     */
    async handleInitialConnection(client: Redis): Promise<void> {
        // Check if we've already exceeded max attempts
        if (this.connectionAttempts > this.config.maxAttempts) {
            LogService.REDIS.error(`Maximum ${this.config.clientName} connection attempts already reached. Aborting connection.`);
            this.config.onMaxAttemptsReached?.(this.config.clientName);
            return;
        }

        try {
            this.connectionAttempts++;
            LogService.REDIS.debug(`Attempting ${this.config.clientName} connection (attempt ${this.connectionAttempts}/${this.config.maxAttempts})`);

            await client.connect();

            // Reset counter on successful connection
            this.connectionAttempts = 0;
            // LogService.REDIS.info(`${this.config.clientName} successfully connected on attempt ${this.connectionAttempts}`);

        } catch (err: any) {
            LogService.REDIS.error(`${this.config.clientName} connection failed (attempt ${this.connectionAttempts}/${this.config.maxAttempts}): ${err.message}`);

            if (this.connectionAttempts > this.config.maxAttempts) {
                LogService.REDIS.error(`Maximum ${this.config.clientName} connection attempts reached during initial connection.`);
                LogService.REDIS.error(`${this.config.clientName} connection closed. Redis-dependent features may not work.`);

                // Custom max attempts handler
                this.config.onMaxAttemptsReached?.(this.config.clientName);
                return;
            }

            // Calculate delay for next retry attempt
            const delay = this.calculateDelay(this.connectionAttempts);
            console.warn(`${this.config.clientName} not ready (attempt ${this.connectionAttempts}/${this.config.maxAttempts}). Retrying in ${delay}ms...`);

            // Wait before the next connection attempt
            await this.sleep(delay);

            // Recursively try again
            await this.handleInitialConnection(client);
        }
    }

    /**
     * Get current connection attempts count
     */
    getConnectionAttempts(): number {
        return this.connectionAttempts;
    }

    /**
     * Reset connection attempts counter
     */
    resetConnectionAttempts(): void {
        this.connectionAttempts = 0;
    }
}