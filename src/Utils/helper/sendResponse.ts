import { pickFunction } from "@/Utils/helper/pickFunction";
import { TCustomErrorResponse, TGenericSuccessMessages } from "@/Utils/types/response.type";
import { Request, Response } from "express";
import fs from 'fs';

const unlinkSafe = (filePath: string | undefined) => {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
    }
}

const successResponse = <T, M>(res: Response, data: TGenericSuccessMessages<T, M>) => {
    const property = pickFunction(data, ["message", "data", "statusCode", "meta", "req"])
    const req = property.req as Request;
    delete property.req;

    cleanUp(req);

    const responsePayload = {
        success: true,
        ...property
        // message: data.message || null,
        // data: data.data,
        // meta: data?.meta || null
    }
    res.status(data.statusCode).json(responsePayload)
}

const errorResponse = (res: Response, data: TCustomErrorResponse) => {

    const property = pickFunction(data, ["errorMessages", "message", "statusCode", "stack", "req"])

    const req = property.req as Request;
    delete property.req;

    cleanUp(req);

    const responsePayload = {
        success: false,
        ...property
        // message: data.message,
        // errorMessages: data.errorMessages,
        // stack: data.stack,
        // statusCode: data.statusCode
    }
    res.status(data.statusCode).json(responsePayload)
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
