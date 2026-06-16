/**
 * Queue job type registry — central source of truth.
 *
 * Every time you add a new queued feature, add its type constant here.
 * The processors/index.ts switch reads these values to route jobs.
 *
 * Usage in a feature service (when enqueuing):
 *   import { QueueJobType } from "@/Config/queue/const";
 *   QueueUtil.enqueue(recordId, { type: QueueJobType.GENERATION, ... });
 *
 * Usage in processors/index.ts (when routing):
 *   case QueueJobType.GENERATION: return handleGenerationJob(job);
 */

export const QueueJobType = {
  GENERATION: "generation",
  CLEANUP   : "cleanup",
} as const;

export type TQueueJobType = typeof QueueJobType[keyof typeof QueueJobType];

// ── Persistent job status (stored in MongoDB) ─────────────────────────────
export const QueueJobStatus = {
  PENDING   : "pending",
  PROCESSING: "processing",
  COMPLETED : "completed",
  FAILED    : "failed",
  CANCELLED : "cancelled",
} as const;

export type TQueueJobStatus = typeof QueueJobStatus[keyof typeof QueueJobStatus];
export const QueueJobStatusValues = Object.values(QueueJobStatus) as [TQueueJobStatus, ...TQueueJobStatus[]];
