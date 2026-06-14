import { Types } from "mongoose";
import { QueueUtil } from "@/Config/queue";
import { QueueJobType } from "@/Config/queue/const";
import { calculatePagination, manageSorting, MongoQueryHelper } from "@/Utils/helper/queryOptimize";
import CustomError from "@/Utils/errors/customError.class";
import { LogService } from "@/Config/logger/utils";
import { FileService } from "@/App/File/service";
import { getIO } from "@/Config/socket";
import { SocketEvent } from "@/Config/socket/events";
import type { TGenerationUpdatePayload } from "@/Config/socket/events";
import GenerationModel from "./model";
import { GenerationStatus } from "./const";
import type { IGeneration, TCallbackBody, TCreateGenerationBody, TListGenerationsPayload } from "./types";
import { GenerationFilterKeys as FilterKeys, GenerationSearchKeys as SearchKeys } from "./types";

type TFileKeys = {
  refImageKey?: string;
  audioKey?   : string;
  mode?       : string;
};

// ── Create ─────────────────────────────────────────────────────────────────
// keys = pre-generated R2 keys from the controller (files not yet uploaded).
// The controller uploads files to R2 AFTER this function returns successfully.
// If enqueue fails the DB record is rolled back here — no file cleanup needed
// because files are uploaded only after this returns.
const create = async (userId: string, body: TCreateGenerationBody, keys: TFileKeys) => {
  const avatarImageKey   = keys.refImageKey ?? body.avatarImageUrl!;
  const inputAudioKey = keys.audioKey;

  const doc = await GenerationModel.create({
    userId      : new Types.ObjectId(userId),
    status      : GenerationStatus.PENDING,
    inputType   : body.inputType,
    voiceId     : body.voiceId,
    avatarImageKey,
    inputText   : body.inputText,
    inputAudioKey,
  });

  try {
    const { queueJobId } = await QueueUtil.enqueue(
      String(doc._id),
      QueueJobType.GENERATION,
      {
        userId,
        voiceId     : body.voiceId,
        inputType   : body.inputType,
        avatarImageKey,
        inputText   : body.inputText,
        inputAudioKey,
        ...(keys.mode ? { mode: keys.mode } : {}),
      },
    );
    // Store the QueueJob reference on the generation doc for easy cross-lookup
    await GenerationModel.findByIdAndUpdate(doc._id, { queueJobId });
    doc.queueJobId = queueJobId;
  } catch (err) {
    await GenerationModel.findByIdAndDelete(doc._id);
    throw err;
  }

  LogService.APPLICATION.info("Generation job queued", { recordId: doc._id });
  return doc.toObject();
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
  data: Partial<Pick<IGeneration, "status" | "outputFileKey" | "errorMessage" | "completedAt">>,
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

  await QueueUtil.remove(String(doc._id));

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

const markCompleted = async (recordId: string, outputFileKey?: string): Promise<void> => {
  await GenerationModel.findByIdAndUpdate(
    recordId,
    { $set: { status: GenerationStatus.COMPLETED, completedAt: new Date(), ...(outputFileKey ? { outputFileKey } : {}) } },
  );

  // Link the FileRecord that was created when the external API uploaded via
  // /files/external-upload. Fire-and-forget — non-critical.
  if (outputFileKey) {
    FileService.findByFileKey(outputFileKey).then(record => {
      if (record?._id) {
        GenerationModel.findByIdAndUpdate(recordId, { $set: { outputFile: record._id } }).catch(() => {});
      }
    }).catch(() => {});
  }
};

// ── Set file refs (called after upload, fire-and-forget) ──────────────────
const setFileRefs = async (
  recordId    : string,
  refs: { avatarImageFile?: string; inputAudioFile?: string },
): Promise<void> => {
  const updates: Record<string, unknown> = {};
  if (refs.avatarImageFile) updates.avatarImageFile = refs.avatarImageFile;
  if (refs.inputAudioFile)  updates.inputAudioFile  = refs.inputAudioFile;
  if (Object.keys(updates).length) {
    await GenerationModel.findByIdAndUpdate(recordId, { $set: updates });
  }
};

const markFailed = async (recordId: string, errorMessage: string): Promise<void> => {
  await GenerationModel.findByIdAndUpdate(recordId, {
    $set: { status: GenerationStatus.FAILED, errorMessage },
  });
};

// ── Socket emit helper ─────────────────────────────────────────────────────
// Fire-and-forget — a socket failure must never crash the callback handler.
const emitToUser = (userId: string, payload: TGenerationUpdatePayload): void => {
  try {
    getIO().to(`user:${userId}`).emit(SocketEvent.GENERATION_UPDATE, payload);
  } catch {
    LogService.APPLICATION.warn("Socket emit failed — user may be offline", {
      userId,
      generationId: payload.generationId,
    });
  }
};

// ── External API callback ──────────────────────────────────────────────────
const handleCallback = async (id: string, body: TCallbackBody): Promise<void> => {
  const doc = await GenerationModel.findById(id).lean();
  if (!doc) throw new CustomError("Generation record not found.", 404);

  const userId = String(doc.userId);

  if (body.success) {
    await markCompleted(id, body.outputFileKey);
    LogService.APPLICATION.info("Generation completed via callback", { recordId: id });

    // Resolve presigned URL so the frontend can use it immediately
    const outputUrl = body.outputFileKey
      ? await FileService.getUrlByKey(body.outputFileKey).catch(() => undefined)
      : undefined;

    emitToUser(userId, {
      generationId : id,
      status       : "completed",
      outputFileKey: body.outputFileKey,
      outputUrl,
    });
  } else {
    const errorMessage = body.message ?? "External API processing did not succeed.";
    await markFailed(id, errorMessage);
    LogService.APPLICATION.warn("Generation failed via callback", { recordId: id });

    emitToUser(userId, {
      generationId: id,
      status      : "failed",
      errorMessage,
    });
  }
};

export const GenerationService = {
  create,
  list,
  getOne,
  update,
  cancel,
  remove,
  handleCallback,
  setFileRefs,
  // Worker callbacks — called exclusively by the queue processor
  markProcessing,
  markCompleted,
  markFailed,
};
