import { Request, Response } from "express";
import { EUserRole } from "@/App/Auth/types";
import catchAsync from "@/Utils/helper/catchAsync";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { queryOptimization } from "@/Utils/helper/queryOptimize";
import CustomError from "@/Utils/errors/customError.class";
import { generateR2Key, uploadFileToR2 } from "@/Utils/file/upload";
import { GenerationService } from "./service";
import { GenerationFilterKeys, GenerationExtraFilterKeys, IGeneration } from "./types";

const IMAGE_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB

// ── Create ─────────────────────────────────────────────────────────────────
const create = catchAsync(async (req: Request, res: Response) => {
  const files       = req.files as Record<string, Express.Multer.File[]> | undefined;
  const refImageFile = files?.["referenceImage"]?.[0];
  const audioFile    = files?.["inputAudio"]?.[0];

  // Validate referenceImage — must be either a file upload or a URL in the body
  if (!refImageFile && !req.body.referenceImageUrl) {
    throw new CustomError(
      "referenceImage is required: upload a file or provide referenceImageUrl.",
      400,
    );
  }

  // Enforce 5 MB cap on the reference image (multer limit is 12 MB for audio)
  if (refImageFile && refImageFile.size > IMAGE_SIZE_LIMIT) {
    throw new CustomError("referenceImage must not exceed 5 MB.", 400);
  }

  // Validate audio presence when inputType = audio
  if (req.body.inputType === "audio" && !audioFile) {
    throw new CustomError("inputAudio file is required when inputType is audio.", 400);
  }

  // Generate R2 keys now (no upload yet — files are uploaded after enqueue)
  const refImageKey = refImageFile
    ? generateR2Key("generations/images", refImageFile.originalname)
    : undefined;
  const audioKey = audioFile
    ? generateR2Key("generations/audio", audioFile.originalname)
    : undefined;

  // Create DB record + enqueue; if enqueue fails the record is rolled back
  const result = await GenerationService.create(req.user!.uid, req.body, {
    refImageKey,
    audioKey,
  });

  // Upload files to R2 only after successful enqueue
  const uploads: Promise<void>[] = [];
  if (refImageFile && refImageKey) {
    uploads.push(uploadFileToR2(refImageFile.path, refImageKey, refImageFile.mimetype));
  }
  if (audioFile && audioKey) {
    uploads.push(uploadFileToR2(audioFile.path, audioKey, audioFile.mimetype));
  }
  await Promise.all(uploads);

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
  sendResponse.success(res, { statusCode: 200, message: "Generations fetched.", data: items, meta, req });
});

// ── Get one ────────────────────────────────────────────────────────────────
const getOne = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const result  = await GenerationService.getOne(req.params["id"] as string, req.user!.uid, isAdmin);
  sendResponse.success(res, { statusCode: 200, message: "Generation fetched.", data: result, req });
});

// ── Update (admin only) ────────────────────────────────────────────────────
const update = catchAsync(async (req: Request, res: Response) => {
  const result = await GenerationService.update(req.params["id"] as string, req.body);
  sendResponse.success(res, { statusCode: 200, message: "Generation updated.", data: result, req });
});

// ── Cancel (owner or admin) ────────────────────────────────────────────────
const cancel = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const result  = await GenerationService.cancel(req.params["id"] as string, req.user!.uid, isAdmin);
  sendResponse.success(res, { statusCode: 200, message: "Generation cancelled.", data: result, req });
});

// ── Delete (admin only) ────────────────────────────────────────────────────
const remove = catchAsync(async (req: Request, res: Response) => {
  const result = await GenerationService.remove(req.params["id"] as string);
  sendResponse.success(res, { statusCode: 200, message: "Generation deleted.", data: result, req });
});

// ── Kokoro callback — POST /:id/callback (x-api-key protected) ────────────
const callback = catchAsync(async (req: Request, res: Response) => {
  await GenerationService.handleCallback(req.params["id"] as string, req.body);
  sendResponse.success(res, { statusCode: 200, message: "Callback processed.", data: null, req });
});

export const GenerationController = { create, list, getOne, update, cancel, remove, callback };
