import { LogService } from "@/Config/logger/utils";
import CustomError from "@/Utils/errors/customError.class";
import catchAsync from "@/Utils/helper/catchAsync";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { NextFunction, Request, Response } from "express";

const log = LogService.AUTH;

/**
 * Validates the Bearer access token from the Authorization header.
 * Attaches the verified payload to `req.user` for downstream use.
 *
 * Usage: router.get("/me", authenticate, controller)
 */
const authenticate = catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer "))
    throw new CustomError("Access token is required.", 401);

  const token = authHeader.split(" ")[1];

  try {
    const payload = JwtHelper.verifyAccessToken(token);
    req.user = {
      uid  : String(payload.uid),
      email: payload.email as string,
      role : payload.role as string,
    };
    log.debug("Token verified", { uid: payload.uid });
  } catch {
    throw new CustomError("Invalid or expired access token.", 401);
  }

  next();
});

export default authenticate;
