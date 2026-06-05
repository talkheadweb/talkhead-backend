import UserModel from "@/App/Auth/model";
import { AuthRedisService } from "@/App/Auth/redisService";
import { IUser, TUserPublic } from "@/App/Auth/types";
import { toPublicUser } from "@/App/Auth/utils";
import { LogService } from "@/Config/logger/utils";
import CustomError from "@/Utils/errors/customError.class";
import { HashHelper } from "@/Utils/helper/hashHelper";
import { calculatePagination, manageSorting, MongoQueryHelper } from "@/Utils/helper/queryOptimize";
import { TMeta } from "@/Utils/types/query.type";
import { Types } from "mongoose";   // needed for ObjectId search validation
import { AdminUserFilterKeys, AdminUserSearchKeys, TAdminCreateUserBody, TAdminUpdateUserBody, TListUsersPayload } from "./types";

const log = LogService.APPLICATION;

// ── List users ─────────────────────────────────────────────────────────────
const listUsers = async (
  query: TListUsersPayload,
): Promise<{ users: TUserPublic[]; meta: TMeta }> => {
  const { page, limit, skip } = calculatePagination(query.paginationFields);
  const { sortBy, sortOrder } = manageSorting<IUser>(query.sortFields);

  const { search }   = query.searchFields as { search?: string };
  const filterFields = query.filterFields as Record<string, string>;

  const queryConditions: Record<string, unknown>[] = [];

  // ── Search ────────────────────────────────────────────────────────────────
  // Loop over AdminUserSearchKeys — every key is treated as a regex String match.
  // ObjectId search is a special case: only add _id if the value is a valid ObjectId.
  if (search) {
    const orConditions: Record<string, unknown>[] = AdminUserSearchKeys.map(key =>
      MongoQueryHelper("String", String(key), search),
    );
    if (Types.ObjectId.isValid(search)) orConditions.push({ _id: String(search) });
    queryConditions.push({ $or: orConditions });
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  // Loop over AdminUserFilterKeys. Type is read from the Mongoose schema so it
  // never drifts from the model definition. For complex/custom cases, add an
  // explicit `if (key === '...')` block before the schema-derived default.
  for (const key of AdminUserFilterKeys) {
    const value = filterFields[String(key)];
    if (!value) continue;

    // ── Custom overrides go here ────────────────────────────────────────────
    // if (key === 'someComplexField') {
    //   queryConditions.push({ [key]: { $elemMatch: ... } });
    //   continue;
    // }

    // Default: Mongoose instance name matches MongoQueryHelper type directly
    const instance = UserModel.schema.path(String(key))?.instance as Parameters<typeof MongoQueryHelper>[0] | undefined;
    if (instance) queryConditions.push(MongoQueryHelper(instance, String(key), value));
  }

  const mongoQuery = queryConditions.length ? { $and: queryConditions } : {};

  const [users, total] = await Promise.all([
    UserModel.find(mongoQuery)
      .sort({ [String(sortBy)]: sortOrder })   // Mongoose accepts "asc" | "desc" directly
      .skip(skip)
      .limit(limit)
      .lean(),
    UserModel.countDocuments(mongoQuery),
  ]);

  return {
    users: users.map(u => toPublicUser(u as any)),
    meta : { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ── Get user by ID ─────────────────────────────────────────────────────────
const getUserById = async (userId: string): Promise<TUserPublic> => {
  const user = await UserModel.findById(userId);
  if (!user) throw new CustomError("User not found.", 404);
  return toPublicUser(user);
};

// ── Create user ────────────────────────────────────────────────────────────
/**
 * Admin-only user creation.
 * Unlike self-registration, the admin can set any role directly.
 * The account is created as already verified.
 */
const createUser = async (payload: TAdminCreateUserBody): Promise<TUserPublic> => {
  const existing = await UserModel.findOne({ email: payload.email });
  if (existing) throw new CustomError("An account with this email already exists.", 409);

  const hashed = await HashHelper.generateHashPassword(payload.password);
  const user   = await UserModel.create({
    name      : payload.name,
    email     : payload.email,
    password  : hashed,
    role      : payload.role,
    isVerified: true,   // admin-created accounts skip email verification
  });

  log.info("Admin created user", { adminAction: true, userId: user._id, role: user.role });
  return toPublicUser(user);
};

// ── Update user ────────────────────────────────────────────────────────────
/**
 * Update user profile fields, role, verification status, or active status.
 * If isActive is set to false, the user's refresh token is revoked immediately
 * so they are kicked out of any active session.
 */
const updateUser = async (
  userId : string,
  payload: TAdminUpdateUserBody,
): Promise<TUserPublic> => {
  if (payload.email) {
    const conflict = await UserModel.findOne({ email: payload.email, _id: { $ne: userId } });
    if (conflict) throw new CustomError("This email address is already in use.", 409);
  }

  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: payload },
    { new: true },
  );
  if (!user) throw new CustomError("User not found.", 404);

  // Kick out a suspended user immediately
  if (payload.isActive === false) {
    await AuthRedisService.refreshToken.del(userId);
    log.info("Admin suspended user — session revoked", { adminAction: true, userId });
  }

  log.info("Admin updated user", { adminAction: true, userId, fields: Object.keys(payload) });
  return toPublicUser(user);
};

// ── Change user password ───────────────────────────────────────────────────
/**
 * Admin password reset — no old password required.
 * Revokes the user's refresh token to force a fresh login.
 */
const changeUserPassword = async (userId: string, password: string): Promise<void> => {
  const user = await UserModel.findById(userId);
  if (!user) throw new CustomError("User not found.", 404);

  const hashed = await HashHelper.generateHashPassword(password);
  await UserModel.findByIdAndUpdate(userId, { password: hashed });
  await AuthRedisService.refreshToken.del(userId);

  log.info("Admin changed user password — session revoked", { adminAction: true, userId });
};

// ── Delete user ────────────────────────────────────────────────────────────
/**
 * Permanently deletes a user and revokes all their active tokens.
 */
const deleteUser = async (userId: string): Promise<void> => {
  const user = await UserModel.findByIdAndDelete(userId);
  if (!user) throw new CustomError("User not found.", 404);

  await AuthRedisService.refreshToken.del(userId);

  log.info("Admin deleted user", { adminAction: true, userId });
};

export const AdminService = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changeUserPassword,
  deleteUser,
};
