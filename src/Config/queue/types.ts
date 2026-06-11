/**
 * Core queue types — owned by Config/queue, the single source of truth.
 *
 * Feature modules import directly from "@/Config/queue" (via QueueUtil).
 */

import { Job } from "bullmq";
import { Types } from "mongoose";
import type { TQueueJobStatus, TQueueJobType } from "./const";

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

// ── Persistent queue job (MongoDB) ─────────────────────────────────────────
export interface IQueueJob {
  recordId     : string;                    // feature document _id
  type         : TQueueJobType;
  payload      : Record<string, unknown>;
  status       : TQueueJobStatus;
  bullJobId?   : string;                    // BullMQ cache ID — informational only
  attempts     : number;
  failedReason?: string;
  startedAt?   : Date;
  finishedAt?  : Date;
  createdAt    : Date;
  updatedAt    : Date;
}

export type TEnqueueResult = {
  queueJobId: Types.ObjectId;   // MongoDB _id of the QueueJob document
};
