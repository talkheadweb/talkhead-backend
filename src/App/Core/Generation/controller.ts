import { Request, Response } from "express";
import { EUserRole } from "@/App/Auth/types";
import catchAsync from "@/Utils/helper/catchAsync";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { queryOptimization } from "@/Utils/helper/queryOptimize";
import { GenerationService } from "./service";
import { GenerationFilterKeys, GenerationExtraFilterKeys, IGeneration } from "./types";

// ── Create ─────────────────────────────────────────────────────────────────
const create = catchAsync(async (req: Request, res: Response) => {
  const result = await GenerationService.create(req.user!.uid, req.body);
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

export const GenerationController = { create, list, getOne, update, cancel, remove };
