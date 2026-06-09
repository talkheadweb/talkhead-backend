/**
 * Queue service — manages BullMQ jobs via REST.
 *
 * Reads job state directly from BullMQ (Redis). No MongoDB model.
 * Business history is stored in each feature's own model (e.g. GenerationModel).
 */

import { bullQueue, QueueUtil } from "@/Config/queue";
import CustomError from "@/Utils/errors/customError.class";
import { TCreateQueueJobBody, TQueueJobStatus } from "./types";
import { v4 as uuidv4 } from "uuid";

// ── Create ─────────────────────────────────────────────────────────────────
const create = async (body: TCreateQueueJobBody) => {
  const recordId = `QJ-${uuidv4().replace(/-/g, "").slice(0, 8)}`;

  const job = await QueueUtil.enqueue(recordId, body.type, body.payload, {
    priority: body.priority,
    delay   : body.delay,
  });

  return {
    recordId,
    bullJobId: job.id,
    type     : body.type,
    status   : "pending" as TQueueJobStatus,
    payload  : body.payload,
    note     : body.note,
  };
};

// ── List ───────────────────────────────────────────────────────────────────
export type TListQueueQuery = {
  status?   : string;
  type?     : string;
  search?   : string;   // matches recordId or bullJobId (partial)
  page?     : number;
  limit?    : number;
  sortBy?   : string;
  sortOrder?: "asc" | "desc";
};

const VALID_STATUSES = ["waiting", "active", "completed", "failed", "delayed", "paused"] as const;

const list = async (query: TListQueueQuery = {}) => {
  const {
    status,
    type,
    search,
    page      = 1,
    limit     = 10,
    sortBy    = "createdAt",
    sortOrder = "desc",
  } = query;

  // Fetch from BullMQ — filter by BullMQ status if provided, otherwise fetch common states
  const statuses = (status && VALID_STATUSES.includes(status as any))
    ? [status as typeof VALID_STATUSES[number]]
    : (["waiting", "active", "failed", "delayed"] as typeof VALID_STATUSES[number][]);

  // Fetch a generous batch so we can filter + sort client-side (BullMQ has no query API)
  const rawJobs = await bullQueue.getJobs(statuses, 0, 999);

  // Map to response shape
  let items = await Promise.all(
    rawJobs.map(async (job) => ({
      bullJobId   : job.id       as string,
      recordId    : job.data.recordId,
      type        : job.data.type,
      status      : await job.getState(),
      payload     : job.data.payload,
      attempts    : job.attemptsMade,
      createdAt   : new Date(job.timestamp),
      processedAt : job.processedOn ? new Date(job.processedOn) : null,
      finishedAt  : job.finishedOn  ? new Date(job.finishedOn)  : null,
      failedReason: job.failedReason ?? null,
    })),
  );

  // Filter by type (job.data.type)
  if (type) {
    items = items.filter((j) => j.type === type);
  }

  // Filter by search — partial match on recordId or bullJobId
  if (search) {
    const q = search.toLowerCase();
    items = items.filter(
      (j) => j.recordId.toLowerCase().includes(q) || j.bullJobId.toLowerCase().includes(q),
    );
  }

  // Sort
  items.sort((a, b) => {
    const aVal = (a as Record<string, any>)[sortBy] ?? a.createdAt;
    const bVal = (b as Record<string, any>)[sortBy] ?? b.createdAt;
    const cmp  = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder === "asc" ? cmp : -cmp;
  });

  // Paginate
  const total      = items.length;
  const skip       = (page - 1) * limit;
  const pagedItems = items.slice(skip, skip + limit);

  return {
    items: pagedItems,
    meta : { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ── Get one ────────────────────────────────────────────────────────────────
const getByBullJobId = async (bullJobId: string) => {
  const job = await bullQueue.getJob(bullJobId);
  if (!job) throw new CustomError("Queue job not found.", 404);

  const state = await job.getState();
  return {
    bullJobId   : job.id,
    recordId    : job.data.recordId,
    type        : job.data.type,
    status      : state,
    payload     : job.data.payload,
    progress    : job.progress,
    attempts    : job.attemptsMade,
    createdAt   : new Date(job.timestamp),
    processedAt : job.processedOn ? new Date(job.processedOn) : null,
    finishedAt  : job.finishedOn  ? new Date(job.finishedOn)  : null,
    failedReason: job.failedReason ?? null,
  };
};

// ── Cancel ─────────────────────────────────────────────────────────────────
const cancel = async (bullJobId: string) => {
  const job = await bullQueue.getJob(bullJobId);
  if (!job) throw new CustomError("Queue job not found.", 404);

  const state = await job.getState();
  if (state === "active") {
    throw new CustomError("Cannot cancel a job that is currently being processed.", 409);
  }
  if (state === "completed") {
    throw new CustomError("Cannot cancel a completed job.", 409);
  }

  await job.remove();
  return { bullJobId, recordId: job.data.recordId, type: job.data.type, status: "cancelled" };
};

export const QueueService = { create, list, getByBullJobId, cancel };
