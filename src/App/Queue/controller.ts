import catchAsync from "@/Utils/helper/catchAsync";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { Request, Response } from "express";
import { QueueService } from "./service";
import { TCreateQueueJobBody } from "./types";

/** POST /api/v1/queue */
const create = catchAsync(async (req: Request, res: Response) => {
  const job = await QueueService.create(req.body as TCreateQueueJobBody);
  sendResponse.success(res, { statusCode: 201, message: "Queue job created.", data: job, req });
});

/** GET /api/v1/queue */
const list = catchAsync(async (req: Request, res: Response) => {
  const {
    status, type, search,
    page, limit,
    sortBy, sortOrder,
  } = req.query as Record<string, string>;

  const result = await QueueService.list({
    status,
    type,
    search,
    page      : Number(page)  || 1,
    limit     : Number(limit) || 10,
    sortBy    : sortBy    || "createdAt",
    sortOrder : (sortOrder === "asc" ? "asc" : "desc"),
  });

  sendResponse.success(res, { statusCode: 200, message: "Queue jobs fetched.", ...result, req });
});

/** GET /api/v1/queue/:id */
const getOne = catchAsync(async (req: Request, res: Response) => {
  const job = await QueueService.getById(req.params["id"] as string);
  sendResponse.success(res, { statusCode: 200, message: "Queue job fetched.", data: job, req });
});

/** DELETE /api/v1/queue/:id */
const cancel = catchAsync(async (req: Request, res: Response) => {
  const job = await QueueService.cancel(req.params["id"] as string);
  sendResponse.success(res, { statusCode: 200, message: "Queue job cancelled.", data: job, req });
});

export const QueueController = { create, list, getOne, cancel };
