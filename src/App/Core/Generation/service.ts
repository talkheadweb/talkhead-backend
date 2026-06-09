import { Types } from "mongoose";
import { QueueUtil } from "@/Config/queue";
import { QueueJobType } from "@/Config/queue/const";
import { calculatePagination, manageSorting, MongoQueryHelper } from "@/Utils/helper/queryOptimize";
import CustomError from "@/Utils/errors/customError.class";
import { LogService } from "@/Config/logger/utils";
import GenerationModel from "./model";
import { GenerationStatus } from "./const";
import type { IGeneration, TCreateGenerationBody, TListGenerationsPayload } from "./types";
import { GenerationFilterKeys as FilterKeys, GenerationSearchKeys as SearchKeys } from "./types";

// ── Create ─────────────────────────────────────────────────────────────────
const create = async (userId: string, body: TCreateGenerationBody) => {
  // 1. Create a placeholder record so we have a recordId for BullMQ
  const doc = await GenerationModel.create({
    userId    : new Types.ObjectId(userId),
    bullJobId : "pending",           // updated after job is queued
    status    : GenerationStatus.PENDING,
    inputType : body.inputType,
    outputType: body.outputType,
    inputText        : body.inputText,
    referenceImageUrl: body.referenceImageUrl,
  });

  // 2. Enqueue — type is the typed discriminant, payload carries feature-specific data
  const job = await QueueUtil.enqueue(
    String(doc._id),
    QueueJobType.GENERATION,
    {
      userId,
      inputType        : body.inputType,
      outputType       : body.outputType,
      inputText        : body.inputText,
      referenceImageUrl: body.referenceImageUrl,
    },
  );

  // 3. Persist the real BullMQ job ID
  doc.bullJobId = job.id as string;
  await doc.save();

  LogService.APPLICATION.info("Generation job queued", { recordId: doc._id, bullJobId: job.id });
  return doc;
};

// ── List (paginated, filtered) ─────────────────────────────────────────────
const list = async (query: TListGenerationsPayload) => {
  const { page, limit, skip } = calculatePagination(query.paginationFields);
  const { sortBy, sortOrder } = manageSorting<IGeneration>(query.sortFields);
  const { search }   = query.searchFields as { search?: string };
  const filterFields = query.filterFields as Record<string, string>;

  const conditions: Record<string, unknown>[] = [];

  if (search) {
    const orConditions = SearchKeys.map(key =>
      MongoQueryHelper("String", String(key), search),
    );
    if (Types.ObjectId.isValid(search)) orConditions.push({ _id: search });
    conditions.push({ $or: orConditions });
  }

  for (const key of FilterKeys) {
    const value = filterFields[String(key)];
    if (!value) continue;
    const instance = GenerationModel.schema.path(String(key))?.instance as Parameters<typeof MongoQueryHelper>[0] | undefined;
    if (instance) conditions.push(MongoQueryHelper(instance, String(key), value));
  }

  if (filterFields["userId"] && Types.ObjectId.isValid(filterFields["userId"])) {
    conditions.push({ userId: new Types.ObjectId(filterFields["userId"]) });
  }

  const mongoQuery = conditions.length ? { $and: conditions } : {};

  const [docs, total] = await Promise.all([
    GenerationModel
      .find(mongoQuery)
      .sort({ [String(sortBy)]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    GenerationModel.countDocuments(mongoQuery),
  ]);

  return { items: docs, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// ── Get one ────────────────────────────────────────────────────────────────
const getOne = async (id: string, requestingUserId: string, isAdmin: boolean) => {
  const doc = await GenerationModel.findById(id).lean();
  if (!doc) throw new CustomError("Generation record not found.", 404);

  if (!isAdmin && String(doc.userId) !== requestingUserId) {
    throw new CustomError("Access denied.", 403);
  }

  return doc;
};

// ── Update (admin patch) ───────────────────────────────────────────────────
const update = async (
  id  : string,
  data: Partial<Pick<IGeneration, "status" | "audioUrl" | "videoUrl" | "ysid" | "errorMessage" | "completedAt">>,
) => {
  const doc = await GenerationModel.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, lean: true },
  );
  if (!doc) throw new CustomError("Generation record not found.", 404);
  return doc;
};

// ── Cancel ─────────────────────────────────────────────────────────────────
const cancel = async (id: string, requestingUserId: string, isAdmin: boolean) => {
  const doc = await GenerationModel.findById(id);
  if (!doc) throw new CustomError("Generation record not found.", 404);

  if (!isAdmin && String(doc.userId) !== requestingUserId) {
    throw new CustomError("Access denied.", 403);
  }

  if (doc.status !== GenerationStatus.PENDING) {
    throw new CustomError(`Cannot cancel a job that is already ${doc.status}.`, 409);
  }

  await QueueUtil.remove(doc.bullJobId);

  doc.status = GenerationStatus.CANCELLED;
  await doc.save();

  return doc;
};

// ── Delete ─────────────────────────────────────────────────────────────────
const remove = async (id: string) => {
  const doc = await GenerationModel.findByIdAndDelete(id).lean();
  if (!doc) throw new CustomError("Generation record not found.", 404);
  return doc;
};

// ── Worker callbacks — called exclusively by the queue processor ───────────
// These are the ONLY way the processor touches Generation data.
// All DB operations live here, never in Config/queue/processors/.

const markProcessing = async (recordId: string): Promise<void> => {
  await GenerationModel.findByIdAndUpdate(recordId, {
    $set: { status: GenerationStatus.PROCESSING },
  });
};

type TJobResult = {
  audioUrl?: string;
  videoUrl?: string;
  ysid?    : string;
};

const markCompleted = async (recordId: string, result: TJobResult = {}): Promise<void> => {
  await GenerationModel.findByIdAndUpdate(recordId, {
    $set: {
      status     : GenerationStatus.COMPLETED,
      completedAt: new Date(),
      ...(result.audioUrl ? { audioUrl: result.audioUrl } : {}),
      ...(result.videoUrl ? { videoUrl: result.videoUrl } : {}),
      ...(result.ysid     ? { ysid    : result.ysid     } : {}),
    },
  });
};

const markFailed = async (recordId: string, errorMessage: string): Promise<void> => {
  await GenerationModel.findByIdAndUpdate(recordId, {
    $set: { status: GenerationStatus.FAILED, errorMessage },
  });
};

export const GenerationService = {
  create,
  list,
  getOne,
  update,
  cancel,
  remove,
  // Worker callbacks — not for HTTP controllers
  markProcessing,
  markCompleted,
  markFailed,
};
