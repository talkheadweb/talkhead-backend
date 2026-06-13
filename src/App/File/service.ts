import { Request } from "express";
import { Types } from "mongoose";
import config from "@/Config";
import { calculatePagination, manageSorting, MongoQueryHelper } from "@/Utils/helper/queryOptimize";
import CustomError from "@/Utils/errors/customError.class";
import { deleteFromR2, generateR2Key, getPresignedUrl, uploadFileToR2 } from "@/Utils/file/upload";
import { isValidMongoID } from "@/Utils/validation/mongoose.validation";
import FileRecordModel from "@/App/File/model";
import { FileType, FileTypeConfig, FileTypeValues, TFileType } from "./const";
import {
  FileExtraFilterKeys,
  FileFilterKeys,
  FileSearchKeys,
  IFileRecord,
  TListFilesPayload,
  TTrackPayload,
  TUploadPayload,
} from "./types";

// ── Upload: upload file to R2 and create FileRecord ────────────────────────
const upload = async (
  file   : Express.Multer.File,
  req    : Request,
  payload: TUploadPayload,
): Promise<IFileRecord> => {
  const uid    = req.user!.uid;
  const config = FileTypeConfig[payload.type];
  const folder = config.getFolder(uid);
  const fileKey = generateR2Key(folder, file.originalname);

  await uploadFileToR2(file.path, fileKey, file.mimetype);

  return FileRecordModel.create({
    type        : payload.type,
    folder,
    fileKey,
    originalName: file.originalname,
    mimeType    : file.mimetype,
    fileSize    : file.size,
    uploadedBy  : new Types.ObjectId(uid),
    ownerId     : payload.ownerId ? new Types.ObjectId(payload.ownerId) : undefined,
  });
};

// ── Track: create FileRecord for a file already uploaded to R2 ─────────────
// Use this when the R2 upload is handled externally (e.g. generation controller,
// auth profile-picture with sharp compression). Pass the userId string directly.
const track = async (
  uploadedBy: string,
  payload   : TTrackPayload,
): Promise<IFileRecord> => {
  const cfg    = FileTypeConfig[payload.type];
  const folder = cfg.getFolder(uploadedBy);

  return FileRecordModel.create({
    type        : payload.type,
    folder,
    fileKey     : payload.fileKey,
    originalName: payload.originalName,
    mimeType    : payload.mimeType,
    fileSize    : payload.fileSize,
    uploadedBy  : new Types.ObjectId(uploadedBy),
    ownerId     : payload.ownerId ? new Types.ObjectId(payload.ownerId) : undefined,
  });
};

// ── externalUpload: upload for external API — no user context ──────────────
// Used by the /files/external-upload endpoint (x-api-key auth, no JWT).
// Stores to R2 under generations/output/<uuid>.<ext> and creates a FileRecord
// with ownerId set to the generationId. uploadedBy is not set.
const externalUpload = async (
  file        : Express.Multer.File,
  generationId: string,
  ownerId?    : string,
): Promise<IFileRecord> => {
  const folder  = `generations/output`;
  const fileKey = generateR2Key(folder, file.originalname);

  await uploadFileToR2(file.path, fileKey, file.mimetype);

  // ownerId takes precedence; fall back to generationId so every generation
  // output is always linkable by its generation.
  const resolvedOwnerId = ownerId ?? generationId;

  return FileRecordModel.create({
    type        : FileType.GENERATION,
    folder,
    fileKey,
    originalName: file.originalname,
    mimeType    : file.mimetype,
    fileSize    : file.size,
    ownerId     : new Types.ObjectId(resolvedOwnerId),
  });
};

// ── findOneByUrl: look up a FileRecord by fileKey (fileUrl is no longer stored)
const findOneByUrl = async (key: string): Promise<IFileRecord | null> =>
  FileRecordModel.findOne({ fileKey: key }).lean();

// ── findByFileKey: look up a FileRecord by its exact R2 object key ─────────
const findByFileKey = async (fileKey: string): Promise<IFileRecord | null> =>
  FileRecordModel.findOne({ fileKey }).lean();

// ── deleteByOwner: remove all cascade-deletable FileRecords for an owner ───
// Only types with deleteWithOwner:true in FileTypeConfig are affected.
const deletableTypes: TFileType[] = FileTypeValues.filter(t => FileTypeConfig[t].deleteWithOwner);

const deleteByOwner = async (ownerId: string): Promise<void> => {
  const ownerObjectId = new Types.ObjectId(ownerId);
  const records = await FileRecordModel.find({
    ownerId: ownerObjectId,
    type   : { $in: deletableTypes },
  }).lean();
  await Promise.all(records.map(r => deleteFromR2(r.fileKey).catch(() => {})));
  await FileRecordModel.deleteMany({ ownerId: ownerObjectId, type: { $in: deletableTypes } });
};

// ── deleteByKey: remove one R2 file + its FileRecord ──────────────────────
const deleteByKey = async (fileKey: string): Promise<void> => {
  await deleteFromR2(fileKey).catch(() => {});
  await FileRecordModel.deleteOne({ fileKey });
};

// ── deleteByRef: delete by fileKey ────────────────────────────────────────
const deleteByRef = async (fileKey: string): Promise<void> => {
  await deleteFromR2(fileKey).catch(() => {});
  await FileRecordModel.deleteOne({ fileKey });
};

// ── getPresignedUrl ────────────────────────────────────────────────────────
const getPresignedUrlById = async (id: string, expiresIn = 3600): Promise<string> => {
  const record = await FileRecordModel.findById(id).lean();
  if (!record) throw new CustomError("File not found.", 404);
  return getPresignedUrl(record.fileKey, expiresIn);
};

// ── getById ────────────────────────────────────────────────────────────────
const getById = async (id: string, uid: string, isAdmin: boolean): Promise<IFileRecord> => {
  if (!isValidMongoID(id)) throw new CustomError("Invalid file id.", 400);
  const record = await FileRecordModel.findById(id).lean();
  if (!record) throw new CustomError("File not found.", 404);
  if (!isAdmin && record.uploadedBy?.toString() !== uid) {
    throw new CustomError("File not found.", 404);
  }
  return record;
};

// ── list ───────────────────────────────────────────────────────────────────
const list = async (query: TListFilesPayload, uid: string, isAdmin: boolean) => {
  const { page, limit, skip } = calculatePagination(query.paginationFields);
  const { sortBy, sortOrder } = manageSorting<IFileRecord>(query.sortFields);
  const { search }   = query.searchFields as { search?: string };
  const filterFields = query.filterFields as Record<string, string>;

  const conditions: Record<string, unknown>[] = [];

  // Non-admins can only see their own files
  if (!isAdmin) conditions.push({ uploadedBy: new Types.ObjectId(uid) });

  if (search) {
    const orConditions = FileSearchKeys.map(key =>
      MongoQueryHelper("String", String(key), search),
    );
    conditions.push({ $or: orConditions });
  }

  for (const key of FileFilterKeys) {
    const value = filterFields[String(key)];
    if (!value) continue;
    const instance = FileRecordModel.schema.path(String(key))?.instance as
      Parameters<typeof MongoQueryHelper>[0] | undefined;
    if (instance) conditions.push(MongoQueryHelper(instance, String(key), value));
  }

  for (const key of FileExtraFilterKeys) {
    const value = filterFields[key];
    if (!value) continue;
    if (key === "ownerId" && isValidMongoID(value)) {
      conditions.push({ ownerId: new Types.ObjectId(value) });
    }
  }

  const mongoQuery = conditions.length ? { $and: conditions } : {};

  const [items, total] = await Promise.all([
    FileRecordModel.find(mongoQuery)
      .sort({ [String(sortBy)]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    FileRecordModel.countDocuments(mongoQuery),
  ]);

  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// ── delete (admin or owner) ─────────────────────────────────────────────────
const remove = async (id: string, uid: string, isAdmin: boolean): Promise<IFileRecord> => {
  if (!isValidMongoID(id)) throw new CustomError("Invalid file id.", 400);
  const record = await FileRecordModel.findById(id).lean();
  if (!record) throw new CustomError("File not found.", 404);
  if (!isAdmin && record.uploadedBy?.toString() !== uid) {
    throw new CustomError("File not found.", 404);
  }
  await FileRecordModel.deleteOne({ _id: id });
  deleteFromR2(record.fileKey).catch(() => {});
  return record;
};

// ── internal helpers ────────────────────────────────────────────────────────

// buildFileUrl: permanent stored reference — CDN URL when custom domain is
// configured, otherwise the raw R2 key. This value is saved in the DB.
const buildFileUrl = (fileKey: string): string => {
  const domain = config.cloudflare_r2.customDomain;
  return domain ? `https://${domain}/${fileKey}` : fileKey;
};

// getUrlByKey: client-facing URL for a given R2 key.
// With a custom domain → CDN URL (permanent, no expiry).
// Without a custom domain → fresh presigned URL (default 1 hour).
// Use this everywhere you need a URL to hand to a client, not buildFileUrl.
const getUrlByKey = async (fileKey: string, expiresIn = 3600): Promise<string> => {
  const domain = config.cloudflare_r2.customDomain;
  return domain ? `https://${domain}/${fileKey}` : getPresignedUrl(fileKey, expiresIn);
};

// toPublicRecord: add a fresh presigned fileUrl to any object that has fileKey.
// fileUrl is never stored in the DB — it is always computed at response time.
const toPublicRecord = async <T extends { fileKey: string }>(
  record: T,
  expiresIn = 3600,
): Promise<T & { fileUrl: string }> => ({ ...record, fileUrl: await getUrlByKey(record.fileKey, expiresIn) });

// toPublicRecords: batch version of toPublicRecord.
const toPublicRecords = <T extends { fileKey: string }>(
  records: T[],
  expiresIn = 3600,
): Promise<(T & { fileUrl: string })[]> => Promise.all(records.map(r => toPublicRecord(r, expiresIn)));

export const FileService = {
  upload, externalUpload, track,
  getUrlByKey, toPublicRecord, toPublicRecords,
  findOneByUrl, findByFileKey,
  deleteByOwner, deleteByKey, deleteByRef,
  getById, getPresignedUrlById, list, remove,
};
