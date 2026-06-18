import catchAsync from "@/Utils/helper/catchAsync";
import { queryOptimization } from "@/Utils/helper/queryOptimize";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { IUser } from "@/App/Auth/types";
import { Request, Response } from "express";
import { AdminService } from "./service";
import {
  AdminUserExtraFilterKeys,
  AdminUserFilterKeys,
  TAdminChangePasswordBody,
  TAdminChangeRoleBody,
  TAdminCreateUserBody,
  TAdminUpdateUserBody,
} from "./types";

/** GET /api/v1/admin/users */
const listUsers = catchAsync(async (req: Request, res: Response) => {
  const payload = queryOptimization<IUser>(req, AdminUserFilterKeys, [...AdminUserExtraFilterKeys]);
  const { users, meta } = await AdminService.listUsers(payload);
  sendResponse.success(res, {
    statusCode: 200,
    message   : "Users fetched successfully.",
    data      : users,
    meta,
    req,
  });
});

/** GET /api/v1/admin/users/:id */
const getUserById = catchAsync(async (req: Request, res: Response) => {
  const user = await AdminService.getUserById(req.params["id"] as string);
  sendResponse.success(res, {
    statusCode: 200,
    message   : "User fetched successfully.",
    data      : user,
    req,
  });
});

/** POST /api/v1/admin/users */
const createUser = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TAdminCreateUserBody;
  const user = await AdminService.createUser(body);
  sendResponse.success(res, {
    statusCode: 201,
    message   : "User created successfully.",
    data      : user,
    req,
  });
});

/** PATCH /api/v1/admin/users/:id */
const updateUser = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TAdminUpdateUserBody;
  const user = await AdminService.updateUser(req.params["id"] as string, body);
  sendResponse.success(res, {
    statusCode: 200,
    message   : "User updated successfully.",
    data      : user,
    req,
  });
});

/** PATCH /api/v1/admin/users/:id/password */
const changeUserPassword = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TAdminChangePasswordBody;
  await AdminService.changeUserPassword(req.params["id"] as string, body.password);
  sendResponse.success(res, {
    statusCode: 200,
    message   : "User password changed successfully.",
    req,
  });
});

/** PATCH /api/v1/admin/users/:id/role */
const changeUserRole = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TAdminChangeRoleBody;
  const user = await AdminService.changeUserRole(req.params["id"] as string, body);
  sendResponse.success(res, {
    statusCode: 200,
    message   : "User role updated successfully.",
    data      : user,
    req,
  });
});

/** DELETE /api/v1/admin/users/:id */
const deleteUser = catchAsync(async (req: Request, res: Response) => {
  await AdminService.deleteUser(req.params["id"] as string);
  sendResponse.success(res, {
    statusCode: 200,
    message   : "User deleted successfully.",
    req,
  });
});

export const AdminController = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changeUserPassword,
  changeUserRole,
  deleteUser,
};
