// ── Job statuses ───────────────────────────────────────────────────────────
// BullMQ native: waiting | active | completed | failed | delayed | paused
// Business statuses (set by external team via REST):
export const QueueJobStatuses = [
  "waiting", "active", "completed", "failed",
  "delayed", "paused", "cancelled", "on-hold",
] as const;

export type TQueueJobStatus = typeof QueueJobStatuses[number];

// ── Request DTOs ───────────────────────────────────────────────────────────

import type { TQueueJobType } from "@/Config/queue/const";

export type TCreateQueueJobBody = {
  type     : TQueueJobType;
  payload  : Record<string, unknown>;
  priority?: number;
  delay?   : number;
  note?    : string;
};

export type TUpdateQueueJobBody = {
  payload?: Record<string, unknown>;
  note?   : string;
};

export type TUpdateStatusBody = {
  status: TQueueJobStatus;
  note? : string;
};
