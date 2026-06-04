import { LogService } from "@/Config/logger/utils";
import catchAsync from "@/Utils/helper/catchAsync";
import { NextFunction, Request, Response } from "express";
import onFinished from "on-finished";

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

    onFinished(res, () => {
        const duration = Date.now() - startTime;
        LogService.NETWORK.debug(`${method} ${originalUrl} ${res.statusCode} — ${duration}ms`, {
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: headers["x-forwarded-for"] ?? headers["x-real-ip"] ?? req.socket.remoteAddress,
            headers: slimHeaders,
        });
    });

    next();
});

export default debuggerMiddleware;
