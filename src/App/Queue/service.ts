/**
 * Queue service — manages queue jobs via REST.
 *
 * Primary source of truth is MongoDB (QueueJobModel) — durable across Redis restarts.
 * BullMQ/Redis is used for live state checks and cancellation only.
 */

import { bullQueue, QueueJobModel, QueueUtil } from "@/Config/queue";
import { QueueJobStatus } from "@/Config/queue/const";
import CustomError from "@/Utils/errors/customError.class";
import { TCreateQueueJobBody, TQueueJobStatus } from "./types";
import { v4 as uuidv4 } from "uuid";

// ── Create ─────────────────────────────────────────────────────────────────
const create = async (body: TCreateQueueJobBody) => {
  const recordId = `QJ-${uuidv4().replace(/-/g, "").slice(0, 8)}`;

  const { queueJobId } = await QueueUtil.enqueue(recordId, body.type, body.payload, {
    priority: body.priority,
    delay   : body.delay,
  });

  return QueueJobModel.findById(queueJobId).lean();
};

// ── List ───────────────────────────────────────────────────────────────────
export type TListQueueQuery = {
  status?   : string;
  type?     : string;
  search?   : string;   // partial match on recordId or bullJobId
  page?     : number;
  limit?    : number;
  sortBy?   : string;
  sortOrder?: "asc" | "desc";
};

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

  const conditions: Record<string, unknown>[] = [];
  if (status) conditions.push({ status });
  if (type)   conditions.push({ type });
  if (search) {
    conditions.push({
      $or: [
        { recordId: { $regex: search, $options: "i" } },
        { bullJobId: { $regex: search, $options: "i" } },
      ],
    });
  }

  const mongoQuery = conditions.length ? { $and: conditions } : {};
  const skip       = (page - 1) * limit;

  const [items, total] = await Promise.all([
    QueueJobModel
      .find(mongoQuery)
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    QueueJobModel.countDocuments(mongoQuery),
  ]);

  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// ── Get one ────────────────────────────────────────────────────────────────
const getById = async (id: string) => {
  const doc = await QueueJobModel.findById(id).lean();
  if (!doc) throw new CustomError("Queue job not found.", 404);
  return doc;
};

// ── Cancel ─────────────────────────────────────────────────────────────────
const cancel = async (id: string) => {
  const doc = await QueueJobModel.findById(id);
  if (!doc) throw new CustomError("Queue job not found.", 404);

  if (doc.status === QueueJobStatus.PROCESSING) {
    throw new CustomError("Cannot cancel a job that is currently being processed.", 409);
  }
  if (doc.status === QueueJobStatus.COMPLETED) {
    throw new CustomError("Cannot cancel a completed job.", 409);
  }
  if (doc.status === QueueJobStatus.CANCELLED) {
    throw new CustomError("Job is already cancelled.", 409);
  }

  // Remove from BullMQ if it is still there (best-effort — Redis may have purged it)
  await QueueUtil.remove(doc.recordId).catch(() => {});

  doc.status = QueueJobStatus.CANCELLED;
  await doc.save();
  return doc;
};

export const QueueService = { create, list, getById, cancel };
