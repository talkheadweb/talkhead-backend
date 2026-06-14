import config from "@/Config";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { HydratedDocument } from "mongoose";
import { AuthRedisService } from "./redisService";
import { IUser, TUserPublic } from "./types";

// ── Shared session resolution ──────────────────────────────────────────────

export type TResolvedSession = {
  uid     : string;
  email   : string;
  role    : string;
  /** true when the access token was expired and the refresh token was used instead */
  refreshed: boolean;
};

/**
 * Resolves a user identity from an access token and/or refresh token.
 *
 * Resolution order:
 *   1. Verify access token → return session (refreshed: false)
 *   2. Access token expired → verify refresh token + Redis revocation check
 *      → return session (refreshed: true)
 *   3. No valid token → throw (caller decides the transport-specific error)
 *
 * Throws a plain Error with a human-readable message. Callers wrap it into
 * their own error type (CustomError for HTTP, socket next(err) for WS).
 */
export const resolveSession = async (
  accessToken ?: string,
  refreshToken ?: string,
): Promise<TResolvedSession> => {
  // ── 1. Try access token ────────────────────────────────────────────────────
  if (accessToken) {
    try {
      const p = JwtHelper.verifyAccessToken(accessToken);
      return { uid: String(p.uid), email: p.email as string, role: p.role as string, refreshed: false };
    } catch (err: any) {
      if (err?.name !== "TokenExpiredError") {
        throw new Error("Invalid access token.");
      }
      // Expired — fall through to refresh token
    }
  }

  // ── 2. Refresh token fallback ──────────────────────────────────────────────
  if (!refreshToken) throw new Error("Authentication required.");

  let rp;
  try {
    rp = JwtHelper.verifyRefreshToken(refreshToken);
  } catch {
    throw new Error("Session expired. Please log in again.");
  }

  const uid    = String(rp.uid);
  const stored = await AuthRedisService.refreshToken.get(uid);
  if (!stored || stored !== refreshToken) {
    throw new Error("Session expired. Please log in again.");
  }

  return { uid, email: rp.email as string, role: rp.role as string, refreshed: true };
};

// ── Strip sensitive fields from a Mongoose user document or lean plain object ──
export const toPublicUser = (user: HydratedDocument<IUser> | (IUser & { _id: unknown })): TUserPublic => {
  // .lean() returns plain objects — toObject() doesn't exist on them
  const obj = typeof (user as any).toObject === "function"
    ? (user as HydratedDocument<IUser>).toObject()
    : user;
  const { password: _pw, ...rest } = obj as IUser & { _id: unknown };
  return rest as unknown as TUserPublic;
};

// ── Email HTML templates ───────────────────────────────────────────────────
export const emailTemplates = {
  verifyEmail: (verifyLink: string): string => `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;">
      <h2>Welcome to ${config.appName}!</h2>
      <p>Please verify your email address by clicking the button below.
         This link expires in <strong>24 hours</strong>.</p>
      <a href="${verifyLink}"
         style="display:inline-block;padding:12px 24px;background:#4F46E5;
                color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
        Verify Email
      </a>
      <p style="color:#888;font-size:12px;margin-top:24px;">
        If you didn't create an account, you can safely ignore this email.
      </p>
    </div>
  `,

  resetPassword: (resetLink: string): string => `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;">
      <h2>Reset your password</h2>
      <p>Click the button below to reset your password.
         This link expires in <strong>1 hour</strong>.</p>
      <a href="${resetLink}"
         style="display:inline-block;padding:12px 24px;background:#4F46E5;
                color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
        Reset Password
      </a>
      <p style="color:#888;font-size:12px;margin-top:24px;">
        If you didn't request a password reset, you can safely ignore this email.
      </p>
    </div>
  `,
};
