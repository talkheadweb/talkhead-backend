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
 *   2. Access token invalid or expired → fall through to refresh token
 *   3. Verify refresh token + Redis revocation check → return session (refreshed: true)
 *   4. No valid token → throw (caller decides the transport-specific error)
 *
 * The access token is treated as a fast-path optimisation only. Any failure
 * (expired, wrong secret, malformed) falls through to the refresh token rather
 * than throwing immediately. This is intentional: the socket transport cannot
 * issue new cookies, so it must be able to authenticate via refresh token alone
 * even when the access token has become invalid between connections.
 *
 * Throws a plain Error with a human-readable message. Callers wrap it into
 * their own error type (CustomError for HTTP, socket next(err) for WS).
 */
/**
 * Resolves a user identity for a Socket.io connection.
 *
 * Difference from resolveSession(): the refresh token path skips the Redis
 * revocation check and only verifies the JWT signature + expiry.
 *
 * Why: the socket transport cannot issue new cookies and has no mechanism to
 * refresh the access token mid-connection. The Redis check exists to enforce
 * single-device session revocation (logout), but requiring it on the socket
 * would mean that any Redis hiccup, token rotation, or race between an expiring
 * access token and the next HTTP refresh would permanently block the socket
 * even though the user is still legitimately logged in.
 *
 * The refresh token JWT expiry (7 days) provides the time-bound guarantee.
 * If hard revocation of sockets is needed (e.g. admin kick), use
 * io.in("user:<uid>").disconnectSockets() from a service method.
 */
export const resolveSocketSession = async (
  accessToken ?: string,
  refreshToken ?: string,
): Promise<TResolvedSession> => {
  // 1. Try access token (fast path — no Redis needed)
  if (accessToken) {
    try {
      const p = JwtHelper.verifyAccessToken(accessToken);
      return { uid: String(p.uid), email: p.email as string, role: p.role as string, refreshed: false };
    } catch {
      // Fall through to refresh token
    }
  }

  // 2. Refresh token — JWT verify only, no Redis revocation check
  if (!refreshToken) throw new Error("Authentication required.");

  try {
    const rp = JwtHelper.verifyRefreshToken(refreshToken);
    return { uid: String(rp.uid), email: rp.email as string, role: rp.role as string, refreshed: true };
  } catch {
    throw new Error("Authentication required.");
  }
};

export const resolveSession = async (
  accessToken ?: string,
  refreshToken ?: string,
): Promise<TResolvedSession> => {
  // ── 1. Try access token (fast path) ───────────────────────────────────────
  if (accessToken) {
    try {
      const p = JwtHelper.verifyAccessToken(accessToken);
      return { uid: String(p.uid), email: p.email as string, role: p.role as string, refreshed: false };
    } catch {
      // Any failure (expired, invalid, wrong secret) — fall through to refresh token.
      // Do NOT throw here: the refresh token is the authoritative credential.
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

// ── Build the JS-readable session info cookie payload ─────────────────────
// Contains only public, non-sensitive fields. The frontend reads this cookie
// to render the UI without a network call — real auth uses the httpOnly tokens.
export const toSessionInfo = (user: { _id: unknown; name: string; email: string; role: string; profilePictureKey?: string | null }): string =>
  JSON.stringify({
    uid  : String(user._id),
    name : user.name,
    email: user.email,
    role : user.role,
    // profilePictureKey included so the frontend can show an avatar immediately.
    // This is the raw key/URL — same rules as TUserPublic.profilePictureKey.
    profilePictureKey: user.profilePictureKey ?? null,
  });

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
