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
import { QueueJobStatus } from "./const";
import QueueJobModel from "@/App/Queue/model";
import type { TEnqueueOptions, TEnqueueResult, TProcessor, TQueueJobData } from "./types";

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
    removeOnComplete: { count: 5 },
    removeOnFail    : { count: 5 },
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

    const getRecordId = (data: T): string | undefined =>
      (data as unknown as TQueueJobData).recordId;

    this.worker.on("active", (job) => {
      log.info("BullMQ: job active", { jobId: job.id });
      const recordId = getRecordId(job.data);
      if (!recordId) return;
      QueueJobModel.findOneAndUpdate(
        { recordId },
        { $set: { status: QueueJobStatus.PROCESSING, startedAt: new Date() } },
      ).catch((err) => log.error("QueueJob active update failed", { message: err.message }));
    });

    this.worker.on("completed", (job) => {
      log.info("BullMQ: job completed", { jobId: job.id });
      const recordId = getRecordId(job.data);
      if (!recordId) return;
      QueueJobModel.findOneAndUpdate(
        { recordId },
        { $set: { status: QueueJobStatus.COMPLETED, finishedAt: new Date() } },
      ).catch((err) => log.error("QueueJob completed update failed", { message: err.message }));
    });

    this.worker.on("failed", (job, err) => {
      log.error("BullMQ: job failed", { jobId: job?.id, message: err.message });
      const recordId = job ? getRecordId(job.data) : undefined;
      if (!recordId) return;
      QueueJobModel.findOneAndUpdate(
        { recordId },
        {
          $set: {
            status      : QueueJobStatus.FAILED,
            failedReason: err.message,
            attempts    : job!.attemptsMade,
            finishedAt  : new Date(),
          },
        },
      ).catch((e) => log.error("QueueJob failed update failed", { message: e.message }));
    });

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

// jobId is set to recordId so BullMQ uses our own ID — enables lookup by _id without
// storing the BullMQ-generated ID anywhere.
const enqueue = async (
  recordId: string,
  type    : TQueueJobType,
  payload : Record<string, unknown>,
  options : TEnqueueOptions = {},
): Promise<TEnqueueResult> => {
  // 1. Persist the job in MongoDB first — durable even if BullMQ/Redis is lost
  const queueJob = await QueueJobModel.create({
    recordId,
    type,
    payload,
    status: QueueJobStatus.PENDING,
  });

  // 2. Add to BullMQ using recordId as the job ID for easy lookup
  const bullJob = await bullQueue.add(
    recordId,
    { type, recordId, payload },
    {
      jobId   : recordId,
      priority: options.priority,
      delay   : options.delay,
      attempts: options.attempts,
    },
  );

  // 3. Store the BullMQ cache ID on the record (non-critical — fire-and-forget)
  QueueJobModel.findByIdAndUpdate(queueJob._id, { bullJobId: bullJob.id })
    .catch((err) => log.error("QueueJob bullJobId update failed", { message: err.message }));

  return { queueJobId: queueJob._id };
};

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
