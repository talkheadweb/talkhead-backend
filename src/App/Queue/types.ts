import type { TQueueJobType } from "@/Config/queue/const";
import type { IQueueJob } from "@/Config/queue/types";
import type { IQueryItems } from "@/Utils/types/query.type";

// ── Search & filter key constants ──────────────────────────────────────────
// Fields searched with regex $or
export const QueueJobSearchKeys: (keyof IQueueJob)[]      = ["recordId", "bullJobId"];
// Fields used for discrete filtering — type auto-derived from Mongoose schema
export const QueueJobFilterKeys: (keyof IQueueJob)[]      = ["status", "type"];
// Extra keys not on the schema
export const QueueJobExtraFilterKeys: string[]             = [];

// ── Query payload type passed from controller → service ────────────────────
export type TListQueueJobsPayload = IQueryItems<Partial<IQueueJob>>;

// ── Request body types ─────────────────────────────────────────────────────
export type TCreateQueueJobBody = {
  type     : TQueueJobType;
  payload  : Record<string, unknown>;
  priority?: number;
  delay?   : number;
};
