/**
 * Cleanup service — called exclusively by the cleanup queue processor.
 *
 * Batch strategy (minimises DB round-trips):
 *   1. One read  → collect all expired IDs / keys into flat arrays
 *   2. One write → bulk-delete FileRecords (deleteMany with $in)
 *   3. One write → bulk-delete Generation / Avatar documents (deleteMany with $in)
 *   R2 deletes run in parallel via Promise.all — errors ignored (404 = already gone).
 *
 * Crash safety: provided by BullMQ retry. If the worker crashes mid-job,
 * BullMQ re-queues it. Already-deleted documents won't appear in the next
 * read query; R2 deletes are idempotent (errors caught). No model changes needed.
 */

import { Types } from "mongoose";
import GenerationModel from "@/App/Core/Generation/model";
import FileRecordModel from "@/App/File/model";
import AvatarModel     from "@/App/Avatar/model";
import { deleteFromR2 } from "@/Utils/file/upload";
import { LogService }   from "@/Config/logger/utils";

const log = LogService.APPLICATION;

export const GENERATION_TTL_DAYS = 7;
export const AVATAR_TTL_DAYS     = 7;

const cutoff = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

// ── 1. Expired generations ─────────────────────────────────────────────────
export const cleanupGenerations = async (): Promise<number> => {
  const docs = await GenerationModel.find(
    { createdAt: { $lt: cutoff(GENERATION_TTL_DAYS) } },
    { _id: 1, avatarImageKey: 1, inputAudioKey: 1, outputFileKey: 1,
      avatarImageFile: 1, inputAudioFile: 1, outputFile: 1 },
  ).lean();

  if (!docs.length) return 0;

  // Collect R2 keys and FileRecord refs in one pass.
  //
  // avatarImageKey / inputAudioKey are only deleted from R2 when the generation
  // owns them — i.e. a FileRecord ref is set (the user uploaded the file for this
  // generation). If the ref is absent the key belongs to an existing Avatar record
  // and must not be touched here.
  //
  // outputFileKey is always generation-specific (uploaded by the external API
  // for this job) so it is always safe to delete regardless of the ref.
  const r2Keys    : string[]         = [];
  const fileRefIds: Types.ObjectId[] = [];

  for (const doc of docs) {
    if (doc.avatarImageFile) {
      r2Keys.push(doc.avatarImageKey);
      fileRefIds.push(doc.avatarImageFile as Types.ObjectId);
    }
    if (doc.inputAudioFile) {
      if (doc.inputAudioKey) r2Keys.push(doc.inputAudioKey);
      fileRefIds.push(doc.inputAudioFile as Types.ObjectId);
    }
    if (doc.outputFileKey) r2Keys.push(doc.outputFileKey);
    if (doc.outputFile)    fileRefIds.push(doc.outputFile as Types.ObjectId);
  }

  // Three bulk operations — R2 parallel, then two deleteMany calls
  await Promise.all(r2Keys.map(k => deleteFromR2(k).catch(() => {})));
  if (fileRefIds.length) {
    await FileRecordModel.deleteMany({ _id: { $in: fileRefIds } });
  }
  await GenerationModel.deleteMany({ _id: { $in: docs.map(d => d._id) } });

  return docs.length;
};

// ── 2. Expired custom avatars (isSystem=false) ─────────────────────────────
export const cleanupCustomAvatars = async (): Promise<number> => {
  const docs = await AvatarModel.find(
    { isSystem: false, createdAt: { $lt: cutoff(AVATAR_TTL_DAYS) } },
    { _id: 1, fileKey: 1 },
  ).lean();

  if (!docs.length) return 0;

  const fileKeys = docs.map(d => d.fileKey);

  await Promise.all(fileKeys.map(k => deleteFromR2(k).catch(() => {})));
  await FileRecordModel.deleteMany({ fileKey: { $in: fileKeys } });
  await AvatarModel.deleteMany({ _id: { $in: docs.map(d => d._id) } });

  return docs.length;
};
