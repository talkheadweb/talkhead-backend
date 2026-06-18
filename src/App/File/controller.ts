import { Request, Response } from "express";
import { EUserRole } from "@/App/Auth/types";
import catchAsync from "@/Utils/helper/catchAsync";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { queryOptimization } from "@/Utils/helper/queryOptimize";
import CustomError from "@/Utils/errors/customError.class";
import { FileService } from "./service";
import { FileExtraFilterKeys, FileFilterKeys, IFileRecord } from "./types";
import { FileType, FileTypeConfig, TFileType } from "./const";

// ── Upload ─────────────────────────────────────────────────────────────────
// type + optional ownerId come from multipart body (validated by uploadFileSchema middleware)
const uploadFile = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) throw new CustomError("File is required.", 400);

  const type   = req.body.type as TFileType;
  const cfg    = FileTypeConfig[type];

  // Validate mime type against the chosen type's allowed list
  if (!cfg.allowedMimes.includes(req.file.mimetype)) {
    throw new CustomError(
      `File type ${req.file.mimetype} is not allowed for ${type}. Allowed: ${cfg.allowedMimes.join(", ")}.`,
      400,
    );
  }

  // Validate size against the chosen type's limit (multer only enforces the global 12 MB cap)
  if (req.file.size > cfg.maxSizeBytes) {
    const mb = (cfg.maxSizeBytes / 1024 / 1024).toFixed(0);
    throw new CustomError(`File exceeds the ${mb} MB limit for ${type}.`, 400);
  }

  // avatar_image uploads are admin-only
  if (type === FileType.AVATAR_IMAGE && req.user!.role !== EUserRole.ADMIN) {
    throw new CustomError("Only admins can upload avatar images.", 403);
  }

  const fileRecord = await FileService.upload(req.file, req, {
    type,
    ownerId: req.body.ownerId as string | undefined,
  });

  const data = await FileService.toPublicRecord(fileRecord);
  sendResponse.success(res, { statusCode: 201, message: "File uploaded.", data, req });
});

// ── External upload — x-api-key protected, no user context ─────────────────
// Used by the external API to upload the generated output file to R2.
// The returned fileKey should be sent as outputFileKey in the callback.
const externalUpload = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) throw new CustomError("File is required.", 400);
  const { generationId, ownerId } = req.body as { generationId: string; ownerId?: string };
  const fileRecord = await FileService.externalUpload(req.file, generationId, ownerId);
  const data = await FileService.toPublicRecord(fileRecord);
  sendResponse.success(res, { statusCode: 201, message: "File uploaded.", data, req });
});

// ── List ───────────────────────────────────────────────────────────────────
const list = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const payload = queryOptimization<IFileRecord>(req, FileFilterKeys, FileExtraFilterKeys);
  const { items, meta } = await FileService.list(payload, req.user!.uid, isAdmin);
  const data = await FileService.toPublicRecords(items);
  sendResponse.success(res, { statusCode: 200, message: "Files fetched.", data, meta, req });
});

// ── Get one ────────────────────────────────────────────────────────────────
const getOne = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const record  = await FileService.getById(String(req.params["id"]), req.user!.uid, isAdmin);
  const data = await FileService.toPublicRecord(record);
  sendResponse.success(res, { statusCode: 200, message: "File fetched.", data, req });
});

// ── Delete ─────────────────────────────────────────────────────────────────
const remove = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  await FileService.remove(String(req.params["id"]), req.user!.uid, isAdmin);
  sendResponse.success(res, { statusCode: 200, message: "File deleted.", data: null, req });
});

// ── Presigned URL ──────────────────────────────────────────────────────────
const presigned = catchAsync(async (req: Request, res: Response) => {
  const expiresIn = req.query["expiresIn"] ? Number(req.query["expiresIn"]) : 3600;
  const url = await FileService.getPresignedUrlById(String(req.params["id"]), expiresIn);
  sendResponse.success(res, { statusCode: 200, message: "Presigned URL generated.", data: { url }, req });
});

export const FileController = { uploadFile, externalUpload, list, getOne, remove, presigned };
