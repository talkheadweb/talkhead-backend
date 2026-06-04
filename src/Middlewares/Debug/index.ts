import { LogService } from "@/Config/logger/utils";
import catchAsync from "@/Utils/helper/catchAsync";
import onFinished from "on-finished";
import { NextFunction, Request, Response } from "express";

const debuggerMiddleware = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const { method, originalUrl } = req;

    const headers = req.headers;
    const slimHeaders = {
        "content-type": headers["content-type"],
        "user-agent": headers["user-agent"],
        "x-forwarded-for": headers["x-forwarded-for"],
        "x-real-ip": headers["x-real-ip"],
        authorization: headers["authorization"] ? "[present]" : undefined,
    };

    let bodyPreview: unknown;
    const body = (req as any).body;
    if (Buffer.isBuffer(body)) {
        bodyPreview = `[raw buffer ${body.length} bytes]`;
    } else if (typeof body === "string" && body.length > 0) {
        bodyPreview = body;
    } else if (body && typeof body === "object" && Object.keys(body).length > 0) {
        try {
            bodyPreview = JSON.parse(JSON.stringify(body));
        } catch {
            bodyPreview = "[unserializable body]";
        }
    }

    onFinished(res, () => {
        const duration = Date.now() - startTime;
        LogService.NETWORK.debug(`${method} ${originalUrl} ${res.statusCode} — ${duration}ms`, {
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: headers["x-forwarded-for"] ?? headers["x-real-ip"] ?? req.socket.remoteAddress,
            headers: slimHeaders,
            body: bodyPreview,
        });
    });

    next();
});

export default debuggerMiddleware;
