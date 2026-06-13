import { Request, Response } from "express";
import catchAsync from "@/Utils/helper/catchAsync";
import { sendResponse } from "@/Utils/helper/sendResponse";
import validateRequest from "@/Middlewares/validateRequest";
import { queryOptimization } from "@/Utils/helper/queryOptimize";
import { FileService } from "@/App/File/service";
import { FileType } from "@/App/File/const";
import { AvatarFilterKeys, AvatarExtraFilterKeys, IAvatar } from "./types";
import { AvatarService } from "./service";
import { createAvatarSchema, updateAvatarSchema } from "./validation";
import CustomError from "@/Utils/errors/customError.class";
import { EUserRole } from "@/App/Auth/types";

// ── Create ─────────────────────────────────────────────────────────────────
export const validateCreateAvatar = validateRequest(createAvatarSchema);

const create = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) throw new CustomError("Avatar image file is required.", 400);

  const fileRecord = await FileService.upload(req.file, req, { type: FileType.AVATAR_IMAGE });
  const avatar = await AvatarService.create(req.user!.uid, req.body, fileRecord);

  sendResponse.success(res, { statusCode: 201, message: "Avatar created.", data: avatar, req });
});

// ── List ───────────────────────────────────────────────────────────────────
const list = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const payload = queryOptimization<IAvatar>(req, AvatarFilterKeys, AvatarExtraFilterKeys);
  const { items, meta } = await AvatarService.list(payload, isAdmin);
  sendResponse.success(res, { statusCode: 200, message: "Avatars fetched.", data: items, meta, req });
});

// ── Get one ────────────────────────────────────────────────────────────────
const getOne = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === EUserRole.ADMIN;
  const avatar = await AvatarService.getById(String(req.params.id), isAdmin);
  sendResponse.success(res, { statusCode: 200, message: "Avatar fetched.", data: avatar, req });
});

// ── Update ─────────────────────────────────────────────────────────────────
export const validateUpdateAvatar = validateRequest(updateAvatarSchema);

const update = catchAsync(async (req: Request, res: Response) => {
  const avatar = await AvatarService.update(String(req.params.id), req.body);
  sendResponse.success(res, { statusCode: 200, message: "Avatar updated.", data: avatar, req });
});

// ── Delete ─────────────────────────────────────────────────────────────────
const remove = catchAsync(async (req: Request, res: Response) => {
  await AvatarService.remove(String(req.params.id));
  sendResponse.success(res, { statusCode: 200, message: "Avatar deleted.", req });
});

export const AvatarController = { create, list, getOne, update, remove };
