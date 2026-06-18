import { EUserRole, IUser } from "@/App/Auth/types";
import { IQueryItems } from "@/Utils/types/query.type";
import z from "zod";
import { AdminValidation } from "./validation";

// ── Search & filter key constants for the user list endpoint ───────────────
// Fields included in full-text $or search (always treated as String/regex)
export const AdminUserSearchKeys: (keyof IUser)[]  = ["name", "email"];
// Fields used for discrete filtering — type derived from Mongoose schema at runtime
export const AdminUserFilterKeys: (keyof IUser)[]  = ["role", "isVerified", "isActive"];
// Extra filter keys not present in the IUser schema (join keys, computed fields)
export const AdminUserExtraFilterKeys: string[]     = ["dateFrom", "dateTo"];

// ── Query payload type passed from controller → service ────────────────────
export type TListUsersPayload = IQueryItems<Partial<IUser>>;

// ── Request body types (derived from Zod — single source of truth) ─────────
export type TAdminCreateUserBody   = z.infer<typeof AdminValidation.createUserSchema>["body"];
export type TAdminUpdateUserBody   = z.infer<typeof AdminValidation.updateUserSchema>["body"];
export type TAdminChangePasswordBody = z.infer<typeof AdminValidation.changeUserPasswordSchema>["body"];
