import { Types } from "mongoose";
import { calculatePagination, manageSorting, MongoQueryHelper } from "@/Utils/helper/queryOptimize";
import CustomError from "@/Utils/errors/customError.class";
import { FileService } from "@/App/File/service";
import type { IFileRecord } from "@/App/File/types";
import AvatarModel from "@/App/Avatar/model";
import {
  AvatarFilterKeys,
  AvatarSearchKeys,
  IAvatar,
  TCreateAvatarBody,
  TListAvatarsPayload,
  TUpdateAvatarBody,
} from "./types";

const FILE_POPULATE = "fileKey mimeType fileSize originalName folder";

// Derive a URL-safe slug from a title string
const toSlug = (title: string): string =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

// ── Create ─────────────────────────────────────────────────────────────────
const create = async (
  userId    : string,
  body      : TCreateAvatarBody,
  fileRecord: IFileRecord,
) => {
  const slug = body.slug ?? toSlug(body.title);

  const existing = await AvatarModel.findOne({ slug }).lean();
  if (existing) throw new CustomError("An avatar with this slug already exists.", 409);

  const doc = await AvatarModel.create({
    title    : body.title,
    slug,
    file     : fileRecord._id,
    fileKey  : fileRecord.fileKey,
    isActive : true,
    createdBy: new Types.ObjectId(userId),
  });
  return doc.toObject();
};

// ── List ───────────────────────────────────────────────────────────────────
const list = async (query: TListAvatarsPayload, isAdmin: boolean) => {
  const { page, limit, skip } = calculatePagination(query.paginationFields);
  const { sortBy, sortOrder } = manageSorting<IAvatar>(query.sortFields);
  const { search }   = query.searchFields as { search?: string };
  const filterFields = query.filterFields as Record<string, string>;

  const conditions: Record<string, unknown>[] = [];

  if (!isAdmin) conditions.push({ isActive: true });

  if (search) {
    const orConditions = AvatarSearchKeys.map(key =>
      MongoQueryHelper("String", String(key), search),
    );
    conditions.push({ $or: orConditions });
  }

  for (const key of AvatarFilterKeys) {
    const value = filterFields[String(key)];
    if (!value) continue;
    const instance = AvatarModel.schema.path(String(key))?.instance as
      Parameters<typeof MongoQueryHelper>[0] | undefined;
    if (instance) conditions.push(MongoQueryHelper(instance, String(key), value));
  }

  const mongoQuery = conditions.length ? { $and: conditions } : {};

  const [items, total] = await Promise.all([
    AvatarModel.find(mongoQuery)
      .sort({ [String(sortBy)]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate("file", FILE_POPULATE)
      .lean(),
    AvatarModel.countDocuments(mongoQuery),
  ]);

  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// ── Get one ────────────────────────────────────────────────────────────────
const getById = async (id: string, isAdmin: boolean) => {
  const filter = isAdmin ? { _id: id } : { _id: id, isActive: true };
  const doc = await AvatarModel.findOne(filter).populate("file", FILE_POPULATE).lean();
  if (!doc) throw new CustomError("Avatar not found.", 404);
  return doc;
};

// ── Update ─────────────────────────────────────────────────────────────────
const update = async (id: string, body: TUpdateAvatarBody) => {
  if (body.slug) {
    const conflict = await AvatarModel.findOne({ slug: body.slug, _id: { $ne: id } }).lean();
    if (conflict) throw new CustomError("An avatar with this slug already exists.", 409);
  }

  const doc = await AvatarModel.findByIdAndUpdate(
    id,
    { $set: body },
    { new: true },
  ).populate("file", FILE_POPULATE).lean();

  if (!doc) throw new CustomError("Avatar not found.", 404);
  return doc;
};

// ── Delete ─────────────────────────────────────────────────────────────────
const remove = async (id: string) => {
  const doc = await AvatarModel.findByIdAndDelete(id).lean();
  if (!doc) throw new CustomError("Avatar not found.", 404);
  // Cascade-delete R2 file + FileRecord via ownerId
  FileService.deleteByOwner(String(doc._id)).catch(() => {});
  return doc;
};

export const AvatarService = { create, list, getById, update, remove };
