/**
 * API key authentication middleware.
 *
 * Reads the key from the `x-api-key` header and compares it against
 * config.queue.api_key (constant-time comparison to prevent timing attacks).
 *
 * Usage:
 *   router.use(apiKeyAuth)          // protect all routes in a router
 *   router.get("/x", apiKeyAuth, controller)   // protect a single route
 */

import config from "@/Config";
import CustomError from "@/Utils/errors/customError.class";
import { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";

const apiKeyAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const provided = req.headers["x-api-key"] as string | undefined;

  if (!provided) throw new CustomError("API key is required.", 401);

  // timingSafeEqual prevents timing-based key enumeration attacks
  const expected = config.queue.api_key;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new CustomError("Invalid API key.", 403);
  }

  next();
};

export default apiKeyAuth;
