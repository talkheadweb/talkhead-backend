import CustomError from "@/Utils/errors/customError.class";
import catchAsync from "@/Utils/helper/catchAsync";
import { NextFunction, Request, Response } from "express";

/**
 * Role-based access guard.
 * Must be used AFTER the `authenticate` middleware, which sets `req.user`.
 *
 * Usage:
 *   router.delete("/admin/users/:id", authenticate, AccessLimit(["admin"]), controller)
 */
const AccessLimit = (allowedRoles: string[]) =>
  catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role;

    if (role && allowedRoles.includes(role)) {
      next();
    } else {
      // 403 Forbidden — user is authenticated but lacks the required role
      throw new CustomError("You do not have permission to perform this action.", 403);
    }
  });

export default AccessLimit;
