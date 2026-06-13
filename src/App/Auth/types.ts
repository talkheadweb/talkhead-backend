import { Types } from "mongoose";
import z from "zod";
import { AuthValidation } from "./validation";

// ── Roles ──────────────────────────────────────────────────────────────────
export enum EUserRole {
  USER  = "user",
  ADMIN = "admin",
}

// ── Document shape (what lives in MongoDB) ────────────────────────────────
export interface IUser {
  _id            : Types.ObjectId;
  name           : string;
  email          : string;
  password      ?: string;         // absent for social-login-only accounts
  googleId      ?: string;         // Google OAuth sub — present for Google-linked accounts
  role           : EUserRole;
  isVerified     : boolean;
  isActive       : boolean;         // false = suspended by admin
  profilePictureKey : string | null;  // R2 file key (uploaded) or external https:// URL (OAuth)
  createdAt      : Date;
  updatedAt      : Date;
}

// ── Service-layer DTOs ─────────────────────────────────────────────────────
export type TRegisterInput = {
  name     : string;
  email    : string;
  password : string;
  // role is not accepted at registration — always defaults to USER
};

export type TLoginInput = {
  email    : string;
  password : string;
};


export type TLoginResponse = {
  user         : TUserPublic;
  accessToken  : string;
  refreshToken : string;
};

export type TUpdateProfileInput = {
  name?: string;
};

// Safe user shape — password never included
export type TUserPublic = Omit<IUser, "password">;

// ── Request body types (derived from Zod — single source of truth) ─────────
export type TRegisterBody          = z.infer<typeof AuthValidation.registerZodSchema>["body"];
export type TLoginBody             = z.infer<typeof AuthValidation.loginZodSchema>["body"];
export type TForgotPasswordBody    = z.infer<typeof AuthValidation.forgotPasswordZodSchema>["body"];
export type TResetPasswordBody     = z.infer<typeof AuthValidation.resetPasswordZodSchema>["body"];
export type TVerifyEmailBody       = z.infer<typeof AuthValidation.verifyEmailZodSchema>["body"];
export type TResendVerificationBody= z.infer<typeof AuthValidation.resendVerificationZodSchema>["body"];
export type TUpdateProfileBody     = z.infer<typeof AuthValidation.updateProfileZodSchema>["body"];
export type TChangePasswordBody    = z.infer<typeof AuthValidation.changePasswordZodSchema>["body"];
export type TClaimSocialCodeBody   = z.infer<typeof AuthValidation.claimSocialCodeZodSchema>["body"];
