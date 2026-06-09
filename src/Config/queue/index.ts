/**
 * BullMQ infrastructure — single source of truth for queue operations.
 *
 * Exports:
 *   bullQueue   — BullMQ Queue instance (internal, used by QueueUtil + App/Queue service)
 *   BullWorker  — OOP worker wrapper (used in bootstrap.ts)
 *   QueueUtil   — feature-level interface for enqueue / state / cancel operations
 *
 * Feature modules only need QueueUtil:
 *
 *   import { QueueUtil } from "@/Config/queue";
 *
 *   const job = await QueueUtil.enqueue(
 *     recordId,                              // MongoDB _id of the feature record
 *     { type: "generation", userId, ... },   // payload — include type for routing
 *     { priority: 1 }                        // optional
 *   );
 *
 * Worker is created once at startup:
 *
 *   import { BullWorker } from "@/Config/queue";
 *   import { processQueueJob } from "@/Config/queue/processors";
 *   const worker = new BullWorker(processQueueJob);
 *   worker.start();
 */

import { Job, Queue, Worker, WorkerOptions, type ConnectionOptions } from "bullmq";
import config from "@/Config";
import { LogService } from "@/Config/logger/utils";
import type { TQueueJobType } from "./const";
import type { TEnqueueOptions, TProcessor, TQueueJobData } from "./types";

const log = LogService.APPLICATION;

// ── Shared Redis connection ────────────────────────────────────────────────
export const bullConnection: ConnectionOptions = {
  host    : config.redis.host,
  port    : config.redis.port,
  password: config.redis.password,
};

// ── Queue instance (singleton) ─────────────────────────────────────────────
export const bullQueue = new Queue(config.queue.name, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts : 3,
    backoff  : { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail    : { count: 50  },
  },
});

bullQueue.on("error", (err) =>
  log.error("BullMQ Queue error", { message: err.message }),
);

// ── Worker class ───────────────────────────────────────────────────────────
/**
 * OOP wrapper around BullMQ Worker.
 *
 * Create once in bootstrap.ts. Pass the root processor from Config/queue/processors.
 *
 *   const worker = new BullWorker(processQueueJob);
 *   worker.start();
 */
export class BullWorker<T = unknown> {
  private worker: Worker<T> | null = null;
  private readonly processor: TProcessor<T>;
  private readonly options: Partial<WorkerOptions>;

  constructor(processor: TProcessor<T>, options: Partial<WorkerOptions> = {}) {
    this.processor = processor;
    this.options   = options;
  }

  start(): void {
    this.worker = new Worker<T>(
      config.queue.name,
      async (job: Job<T>) => {
        log.info("BullMQ: processing job", { jobId: job.id, name: job.name });
        await this.processor(job);
      },
      {
        connection : bullConnection,
        concurrency: config.queue.concurrency,
        ...this.options,
      },
    );

    this.worker.on("completed", (job) =>
      log.info("BullMQ: job completed", { jobId: job.id }),
    );
    this.worker.on("failed", (job, err) =>
      log.error("BullMQ: job failed", { jobId: job?.id, message: err.message }),
    );
    this.worker.on("error", (err) =>
      log.error("BullMQ: worker error", { message: err.message }),
    );

    log.info("BullMQ worker started", { queue: config.queue.name, concurrency: config.queue.concurrency });
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    log.info("BullMQ worker stopped");
  }
}

// ── QueueUtil — feature-level interface ───────────────────────────────────
/**
 * The only thing feature services need for queue operations.
 * Import bullQueue directly only if you need advanced BullMQ API (e.g. App/Queue service).
 */

const enqueue = (
  recordId: string,
  type    : TQueueJobType,
  payload : Record<string, unknown>,
  options : TEnqueueOptions = {},
): Promise<Job<TQueueJobData>> =>
  bullQueue.add(
    recordId,
    { type, recordId, payload },
    {
      priority: options.priority,
      delay   : options.delay,
      attempts: options.attempts,
    },
  );

const getJobState = async (bullJobId: string): Promise<string | null> => {
  const job = await bullQueue.getJob(bullJobId);
  return job ? job.getState() : null;
};

const remove = async (bullJobId: string): Promise<void> => {
  const job = await bullQueue.getJob(bullJobId);
  if (job) await job.remove();
};

const close = (): Promise<void> => bullQueue.close();

export const QueueUtil = { enqueue, getJobState, remove, close };
