import { EUserRole } from "@/App/Auth/types";
import CustomError from "@/Utils/errors/customError.class";
import catchAsync from "@/Utils/helper/catchAsync";
import { NextFunction, Request, Response } from "express";

/**
 * Role-based access guard.
 * Must be used AFTER the `authenticate` middleware, which sets `req.user`.
 *
 * Usage:
 *   import { EUserRole } from "@/App/Auth/types";
 *   router.delete("/admin/users/:id", authenticate, AccessLimit([EUserRole.ADMIN]), controller)
 */
const AccessLimit = (allowedRoles: EUserRole[]) =>
  catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role;

    if (role && allowedRoles.includes(role as EUserRole)) {
      next();
    } else {
      throw new CustomError("You do not have permission to perform this action.", 403);
    }
  });

export default AccessLimit;
