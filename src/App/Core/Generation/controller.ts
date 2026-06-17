import { Request, Response } from "express";
import { EUserRole } from "@/App/Auth/types";
import catchAsync from "@/Utils/helper/catchAsync";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { queryOptimization } from "@/Utils/helper/queryOptimize";
import CustomError from "@/Utils/errors/customError.class";
import { generateR2Key, uploadFileToR2 } from "@/Utils/file/upload";
import { FileService } from "@/App/File/service";
import { FileType } from "@/App/File/const";
import { GenerationService } from "./service";
import { GenerationFilterKeys, GenerationExtraFilterKeys, IGeneration } from "./types";

const IMAGE_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB

// Enrich a generation doc for the frontend.
// All original keys are kept; presigned URLs are added alongside them:
//   avatarImageKey (R2 key)  → + avatarImageUrl (presigned)
//   inputAudioKey            → + inputAudioUrl  (presigned)
//   outputFileKey            → + outputUrl      (presigned)
// External https:// values in avatarImageKey are left unchanged (no extra field added).
const withPublicUrls = async <T extends Partial<IGeneration>>(
  doc: T,
): Promise<T & { avatarImageUrl?: string; inputAudioUrl?: string; outputUrl?: string }> => {
  const result: Record<string, unknown> = { ...doc };

  if (doc.avatarImageKey) {
    result["avatarImageUrl"] = await FileService.getUrlByKey(doc.avatarImageKey);
  }

  if (doc.inputAudioKey) {
    result["inputAudioUrl"] = await FileService.getUrlByKey(doc.inputAudioKey);
  }

  if (doc.outputFileKey) {
    result["outputUrl"] = await FileService.getUrlByKey(doc.outputFileKey);
  }

  return result as T & { avatarImageUrl?: string; inputAudioUrl?: string; outputUrl?: string };
};

const withPublicUrlsBatch = <T extends Partial<IGeneration>>(docs: T[]) =>
  Promise.all(docs.map(withPublicUrls));

// ── Create ─────────────────────────────────────────────────────────────────
const create = catchAsync(async (req: Request, res: Response) => {
  const files          = req.files as Record<string, Express.Multer.File[]> | undefined;
  const avatarImageFile = files?.["avatarImage"]?.[0];
  const inputAudioFile  = files?.["inputAudio"]?.[0];

  // Validate avatarImage — must be a file upload or an existing Avatar file key
  if (!avatarImageFile && !req.body.avatarImageKey) {
    throw new CustomError(
      "avatarImage is required: upload a file or provide avatarImageKey.",
      400,
    );
  }

  // Enforce 5 MB cap on the avatar image (multer limit is 12 MB for audio)
  if (avatarImageFile && avatarImageFile.size > IMAGE_SIZE_LIMIT) {
    throw new CustomError("avatarImage must not exceed 5 MB.", 400);
  }

  // Validate audio presence when inputType = audio
  if (req.body.inputType === "audio" && !inputAudioFile) {
    throw new CustomError("inputAudio file is required when inputType is audio.", 400);
  }

  // Generate R2 keys now (no upload yet — files are uploaded after enqueue)
  const refImageKey = avatarImageFile
    ? generateR2Key("generations/images", avatarImageFile.originalname)
    : undefined;
  const audioKey = inputAudioFile
    ? generateR2Key("generations/audio", inputAudioFile.originalname)
    : undefined;

  // Create DB record + enqueue; if enqueue fails the record is rolled back
  const mode = (req.query as { mode?: string }).mode;
  const result = await GenerationService.create(req.user!.uid, req.body, {
    refImageKey,
    audioKey,
    mode,
  });

  // Upload files to R2 after successful enqueue, track each as a FileRecord, store refs
  const refIds: { avatarImageFile?: string; inputAudioFile?: string } = {};

  const uploads: Promise<void>[] = [];
  if (avatarImageFile && refImageKey) {
    uploads.push(
      uploadFileToR2(avatarImageFile.path, refImageKey, avatarImageFile.mimetype).then(() => {
        FileService.track(req.user!.uid, {
          type        : FileType.GENERATION,
          fileKey     : refImageKey,
          originalName: avatarImageFile.originalname,
          mimeType    : avatarImageFile.mimetype,
          fileSize    : avatarImageFile.size,
          ownerId     : String(result._id),
        }).then(fr => { if (fr?._id) refIds.avatarImageFile = String(fr._id); }).catch(() => {});
      }),
    );
  }
  if (inputAudioFile && audioKey) {
    uploads.push(
      uploadFileToR2(inputAudioFile.path, audioKey, inputAudioFile.mimetype).then(() => {
        FileService.track(req.user!.uid, {
          type        : FileType.GENERATION,
          fileKey     : audioKey,
          originalName: inputAudioFile.originalname,
          mimeType    : inputAudioFile.mimetype,
          fileSize    : inputAudioFile.size,
          ownerId     : String(result._id),
        }).then(fr => { if (fr?._id) refIds.inputAudioFile = String(fr._id); }).catch(() => {});
      }),
    );
  }
  await Promise.all(uploads);

  // Persist file refs (fire-and-forget — non-blocking)
  if (refIds.avatarImageFile || refIds.inputAudioFile) {
    GenerationService.setFileRefs(String(result._id), refIds).catch(() => {});
  }

  sendResponse.success(res, { statusCode: 201, message: "Generation job created.", data: result, req });
});

// ── List (own — user sees only theirs; admin sees all) ─────────────────────
const list = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const payload = queryOptimization<IGeneration>(req, GenerationFilterKeys, GenerationExtraFilterKeys);

  // Enforce ownership for non-admins
  if (!isAdmin) {
    (payload.filterFields as Record<string, string>)["userId"] = req.user!.uid;
  }

  const { items, meta } = await GenerationService.list(payload);
  const data = await withPublicUrlsBatch(items);
  sendResponse.success(res, { statusCode: 200, message: "Generations fetched.", data, meta, req });
});

// ── Get one ────────────────────────────────────────────────────────────────
const getOne = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const result  = await GenerationService.getOne(req.params["id"] as string, req.user!.uid, isAdmin);
  const data = await withPublicUrls(result);
  sendResponse.success(res, { statusCode: 200, message: "Generation fetched.", data, req });
});

// ── Update — admin: all fields; user: label/tags on own generation ─────────
const update = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const id      = req.params["id"] as string;
  let result;

  if (isAdmin) {
    result = await GenerationService.update(id, req.body);
  } else {
    const { label, tags } = req.body as { label?: string; tags?: string[] };
    if (label === undefined && tags === undefined) {
      throw new CustomError("Users can only update label or tags.", 403);
    }
    result = await GenerationService.label(id, req.user!.uid, { label, tags });
  }

  const data = await withPublicUrls(result);
  sendResponse.success(res, { statusCode: 200, message: "Generation updated.", data, req });
});

// ── Cancel (owner or admin) ────────────────────────────────────────────────
const cancel = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const result  = await GenerationService.cancel(req.params["id"] as string, req.user!.uid, isAdmin);
  sendResponse.success(res, { statusCode: 200, message: "Generation cancelled.", data: result, req });
});

// ── Delete (owner or admin) ────────────────────────────────────────────────
const remove = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const result  = await GenerationService.remove(req.params["id"] as string, req.user!.uid, isAdmin);
  sendResponse.success(res, { statusCode: 200, message: "Generation deleted.", data: result, req });
});

// ── External API callback — POST /:id/callback (x-api-key protected) ────────
const callback = catchAsync(async (req: Request, res: Response) => {
  await GenerationService.handleCallback(req.params["id"] as string, req.body);
  sendResponse.success(res, { statusCode: 200, message: "Callback processed.", data: null, req });
});

export const GenerationController = { create, list, getOne, update, cancel, remove, callback };
