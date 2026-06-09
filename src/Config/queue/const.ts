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
  // Add new job types here:
  // TRANSCRIPTION: "transcription",
  // SUMMARY      : "summary",
} as const;

export type TQueueJobType = typeof QueueJobType[keyof typeof QueueJobType];
