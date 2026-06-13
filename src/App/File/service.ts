import { Request } from "express";
import { Types } from "mongoose";
import config from "@/Config";
import { calculatePagination, manageSorting, MongoQueryHelper } from "@/Utils/helper/queryOptimize";
import CustomError from "@/Utils/errors/customError.class";
import { deleteFromR2, generateR2Key, getPresignedUrl, uploadFileToR2 } from "@/Utils/file/upload";
import { isValidMongoID } from "@/Utils/validation/mongoose.validation";
import FileRecordModel from "@/App/File/model";
import { FileTypeConfig, FileTypeValues, TFileType } from "./const";
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

  const fileUrl = buildFileUrl(fileKey);

  return FileRecordModel.create({
    type        : payload.type,
    folder,
    fileKey,
    fileUrl,
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
    fileUrl     : payload.fileUrl,
    originalName: payload.originalName,
    mimeType    : payload.mimeType,
    fileSize    : payload.fileSize,
    uploadedBy  : new Types.ObjectId(uploadedBy),
    ownerId     : payload.ownerId ? new Types.ObjectId(payload.ownerId) : undefined,
  });
};

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

// ── deleteByRef: delete when you only have a URL (e.g. auth profilePicture) ─
// Matches FileRecord by fileUrl OR fileKey, so either storage format works.
const deleteByRef = async (keyOrUrl: string): Promise<void> => {
  await deleteFromR2(keyOrUrl).catch(() => {});
  await FileRecordModel.deleteOne({
    $or: [{ fileKey: keyOrUrl }, { fileUrl: keyOrUrl }],
  });
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
  if (!isAdmin && record.uploadedBy.toString() !== uid) {
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
  if (!isAdmin && record.uploadedBy.toString() !== uid) {
    throw new CustomError("File not found.", 404);
  }
  await FileRecordModel.deleteOne({ _id: id });
  deleteFromR2(record.fileKey).catch(() => {});
  return record;
};

// ── internal helpers ────────────────────────────────────────────────────────
const buildFileUrl = (fileKey: string): string => {
  const domain = config.cloudflare_r2.customDomain;
  return domain ? `https://${domain}/${fileKey}` : fileKey;
};

export const FileService = { upload, track, deleteByOwner, deleteByKey, deleteByRef, getById, getPresignedUrlById, list, remove };
