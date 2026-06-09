/**
 * Core queue types — owned by Config/queue, the single source of truth.
 *
 * Feature modules import directly from "@/Config/queue" (via QueueUtil).
 */

import { Job } from "bullmq";
import type { TQueueJobType } from "./const";

/**
 * Canonical BullMQ job data shape.
 *
 * `type` is a top-level typed discriminant — never bury it inside payload.
 * The processor's switch reads `job.data.type` to route to the correct handler.
 * TypeScript will warn if an unrecognised type is used at the call site.
 */
export type TQueueJobData = {
  /** Typed job discriminant — value from QueueJobType in Config/queue/const.ts */
  type    : TQueueJobType;

  /** MongoDB record _id — used by the processor to find + update the right document. */
  recordId: string;

  /** Feature-specific data (userId, inputType, referenceImageUrl, …). No `type` here. */
  payload : Record<string, unknown>;
};

export type TEnqueueOptions = {
  priority?: number;   // lower number = higher priority
  delay?   : number;   // milliseconds before job becomes active
  attempts?: number;   // override default retry count (3)
};

/** Function signature expected by BullMQ Worker + BullWorker class */
export type TProcessor<T = unknown> = (job: Job<T>) => Promise<void>;
