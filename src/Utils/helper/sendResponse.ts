import { pickFunction } from "@/Utils/helper/pickFunction";
import { TCustomErrorResponse, TGenericSuccessMessages } from "@/Utils/types/response.type";
import { Request, Response } from "express";
import fs from 'fs';

const unlinkSafe = (filePath: string | undefined) => {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
        // Ignore — temp file may already be cleaned up
    }
}

const successResponse = <T, M>(res: Response, data: TGenericSuccessMessages<T, M>) => {
    const property = pickFunction(data, ["message", "data", "statusCode", "meta", "req"]);
    const req = property.req as Request;
    delete property.req;

    cleanUp(req);

    res.status(data.statusCode).json({ success: true, ...property });
}

const errorResponse = (res: Response, data: TCustomErrorResponse) => {
    const property = pickFunction(data, ["errorMessages", "message", "statusCode", "stack", "req"]);

    const req = property.req as Request;
    delete property.req;

    cleanUp(req);

    res.status(data.statusCode).json({ success: false, ...property });
}

const cleanUp = (req: Request) => {
    if (req?.file) {
        unlinkSafe(req.file.path);
    }
    if (req?.files) {
        const filesValue = req.files as unknown;
        if (Array.isArray(filesValue)) {
            filesValue.forEach(file => unlinkSafe((file as Express.Multer.File)?.path));
        } else if (filesValue && typeof filesValue === "object") {
            Object.values(filesValue as Record<string, Express.Multer.File[]>).forEach((fileList) => {
                fileList.forEach(file => unlinkSafe(file?.path));
            });
        }
    }
}

export const sendResponse = {
    success: successResponse,
    error: errorResponse
}
