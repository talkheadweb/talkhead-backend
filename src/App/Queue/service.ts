import QueueJobModel from "@/App/Queue/model";
import { QueueUtil } from "@/Config/queue";
import { QueueJobStatus } from "@/Config/queue/const";
import { IQueueJob } from "@/Config/queue/types";
import { calculatePagination, manageSorting, MongoQueryHelper } from "@/Utils/helper/queryOptimize";
import CustomError from "@/Utils/errors/customError.class";
import { Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import {
  QueueJobFilterKeys,
  QueueJobSearchKeys,
  TCreateQueueJobBody,
  TListQueueJobsPayload,
} from "./types";

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
const list = async (query: TListQueueJobsPayload) => {
  const { page, limit, skip } = calculatePagination(query.paginationFields);
  const { sortBy, sortOrder } = manageSorting<IQueueJob>(query.sortFields);
  const { search }   = query.searchFields as { search?: string };
  const filterFields = query.filterFields as Record<string, string>;

  const conditions: Record<string, unknown>[] = [];

  if (search) {
    const orConditions = QueueJobSearchKeys.map(key =>
      MongoQueryHelper("String", String(key), search),
    );
    if (Types.ObjectId.isValid(search)) orConditions.push({ _id: search });
    conditions.push({ $or: orConditions });
  }

  for (const key of QueueJobFilterKeys) {
    const value = filterFields[String(key)];
    if (!value) continue;
    const instance = QueueJobModel.schema.path(String(key))?.instance as Parameters<typeof MongoQueryHelper>[0] | undefined;
    if (instance) conditions.push(MongoQueryHelper(instance, String(key), value));
  }

  const mongoQuery = conditions.length ? { $and: conditions } : {};

  const [items, total] = await Promise.all([
    QueueJobModel
      .find(mongoQuery)
      .sort({ [String(sortBy)]: sortOrder })
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

  await QueueUtil.remove(doc.recordId).catch(() => {});

  doc.status = QueueJobStatus.CANCELLED;
  await doc.save();
  return doc;
};

export const QueueService = { create, list, getById, cancel };
