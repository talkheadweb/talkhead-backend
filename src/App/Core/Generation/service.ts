import path from "path";
import { Types } from "mongoose";
import { QueueUtil } from "@/Config/queue";
import { QueueJobType } from "@/Config/queue/const";
import { calculatePagination, manageSorting, MongoQueryHelper } from "@/Utils/helper/queryOptimize";
import CustomError from "@/Utils/errors/customError.class";
import { LogService } from "@/Config/logger/utils";
import { FileService } from "@/App/File/service";
import { FileType } from "@/App/File/const";
import GenerationModel from "./model";
import { GenerationStatus } from "./const";
import type { IGeneration, TCallbackBody, TCreateGenerationBody, TListGenerationsPayload } from "./types";
import { GenerationFilterKeys as FilterKeys, GenerationSearchKeys as SearchKeys } from "./types";

type TFileKeys = {
  refImageKey?: string;   // pre-generated R2 key for referenceImage file upload
  audioKey?   : string;   // pre-generated R2 key for inputAudio file upload
};

// ── Create ─────────────────────────────────────────────────────────────────
// keys = pre-generated R2 keys from the controller (files not yet uploaded).
// The controller uploads files to R2 AFTER this function returns successfully.
// If enqueue fails the DB record is rolled back here — no file cleanup needed
// because files are uploaded only after this returns.
const create = async (userId: string, body: TCreateGenerationBody, keys: TFileKeys) => {
  const referenceImage = keys.refImageKey ?? body.referenceImageUrl!;
  const inputAudio     = keys.audioKey;

  const doc = await GenerationModel.create({
    userId        : new Types.ObjectId(userId),
    status        : GenerationStatus.PENDING,
    inputType     : body.inputType,
    voiceId       : body.voiceId,
    referenceImage,
    inputText     : body.inputText,
    inputAudio,
  });

  try {
    const { queueJobId } = await QueueUtil.enqueue(
      String(doc._id),
      QueueJobType.GENERATION,
      {
        userId,
        voiceId       : body.voiceId,
        inputType     : body.inputType,
        referenceImage,
        inputText     : body.inputText,
        inputAudio,
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
  data: Partial<Pick<IGeneration, "status" | "outputUrl" | "errorMessage" | "completedAt">>,
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

const markCompleted = async (recordId: string, outputUrl?: string): Promise<void> => {
  const doc = await GenerationModel.findByIdAndUpdate(
    recordId,
    { $set: { status: GenerationStatus.COMPLETED, completedAt: new Date(), ...(outputUrl ? { outputUrl } : {}) } },
    { new: false, lean: true },   // return the pre-update doc so we have userId
  );

  // Track the output file in FileRecord and store the ref (fire-and-forget — non-critical)
  if (outputUrl && doc?.userId) {
    const ext  = path.extname(outputUrl).toLowerCase();
    const mime = videoMimeFromExt(ext) ?? "application/octet-stream";
    FileService.track(String(doc.userId), {
      type        : FileType.GENERATION,
      fileKey     : outputUrl,
      fileUrl     : outputUrl,
      originalName: path.basename(outputUrl) || `output_${recordId}${ext}`,
      mimeType    : mime,
      fileSize    : 0,   // unknown — file lives on external service
      ownerId     : recordId,
    }).then(fileRecord => {
      if (fileRecord?._id) {
        GenerationModel.findByIdAndUpdate(recordId, { $set: { outputFile: fileRecord._id } }).catch(() => {});
      }
    }).catch(() => {});
  }
};

const videoMimeFromExt = (ext: string): string | undefined => {
  const map: Record<string, string> = {
    ".mp4" : "video/mp4",
    ".mpeg": "video/mpeg",
    ".mpg" : "video/mpeg",
    ".mov" : "video/quicktime",
    ".webm": "video/webm",
    ".avi" : "video/x-msvideo",
    ".mp3" : "audio/mpeg",
    ".wav" : "audio/wav",
    ".m4a" : "audio/x-m4a",
  };
  return map[ext];
};

// ── Set file refs (called after upload, fire-and-forget) ──────────────────
const setFileRefs = async (
  recordId    : string,
  refs: { refImageFile?: string; audioFile?: string },
): Promise<void> => {
  const updates: Record<string, unknown> = {};
  if (refs.refImageFile) updates.refImageFile = refs.refImageFile;
  if (refs.audioFile)    updates.audioFile    = refs.audioFile;
  if (Object.keys(updates).length) {
    await GenerationModel.findByIdAndUpdate(recordId, { $set: updates });
  }
};

const markFailed = async (recordId: string, errorMessage: string): Promise<void> => {
  await GenerationModel.findByIdAndUpdate(recordId, {
    $set: { status: GenerationStatus.FAILED, errorMessage },
  });
};

// ── Kokoro callback — called by the external Kokoro backend ────────────────
const handleCallback = async (id: string, body: TCallbackBody): Promise<void> => {
  const doc = await GenerationModel.findById(id).lean();
  if (!doc) throw new CustomError("Generation record not found.", 404);

  if (body.success) {
    await markCompleted(id, body.outputUrl);
    LogService.APPLICATION.info("Generation completed via callback", { recordId: id });
  } else {
    await markFailed(id, "Kokoro processing did not succeed.");
    LogService.APPLICATION.warn("Generation failed via callback", { recordId: id });
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
