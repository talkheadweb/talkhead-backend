import config from "@/Config";
import { LogService } from "@/Config/logger/utils";
import CustomError from "@/Utils/errors/customError.class";
import { HashHelper } from "@/Utils/helper/hashHelper";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { MailUtils } from "@/Utils/mail/resend";
import { deleteFromR2, getPresignedUrl, uploadProfileImageToR2 } from "@/Utils/file/upload";
import { v4 as uuidv4 } from "uuid";
import UserModel from "./model";
import { AuthRedisService, TSocialCodePayload } from "./redisService";
import {
  TLoginInput,
  TLoginResponse,
  TRegisterInput,
  TUpdateProfileInput,
  TUserPublic,
} from "./types";
import { emailTemplates, toPublicUser } from "./utils";

const log = LogService.APPLICATION;

// ── Register ───────────────────────────────────────────────────────────────
/**
 * Creates a new user account and triggers the email-verification flow.
 *
 * Business rules:
 * - Email must be unique across all accounts.
 * - Password is hashed with bcrypt before persistence.
 * - A 24-hour one-time verification token is stored in Redis and emailed to the user.
 * - The account cannot log in until the email is verified.
 */
const register = async (payload: TRegisterInput): Promise<void> => {
  const { name, email, password } = payload;

  const existing = await UserModel.findOne({ email });
  if (existing) throw new CustomError("An account with this email already exists.", 409);

  const hashedPassword = await HashHelper.generateHashPassword(password);
  // role defaults to EUserRole.USER in the Mongoose schema — never trust client input
  const user = await UserModel.create({ name, email, password: hashedPassword });

  // Generate and store a 24h verification token, then send the email
  const token      = uuidv4();
  const verifyLink = `${config.frontend.verify_page_url}?token=${token}&userId=${user._id}`;
  await AuthRedisService.verifyToken.set(user._id.toString(), token);

  await MailUtils.sendMail({
    from   : `${config.appName} <${config.mail.admin_contact_email}>`,
    to     : email,
    subject: "Verify your email address",
    html   : emailTemplates.verifyEmail(verifyLink),
  });

  log.info("New user registered", { userId: user._id, email: user.email, role: user.role });
};

// ── Login ──────────────────────────────────────────────────────────────────
/**
 * Authenticates the user and issues JWT tokens.
 *
 * Business rules:
 * - Both email and password must be correct (same error message — no email enumeration).
 * - If the email is not verified, a FRESH verification link is automatically sent and a
 *   403 is returned. This handles the case where the original 24h token has expired.
 * - On success: access token returned in response body, refresh token stored in Redis
 *   and delivered to the client as an httpOnly cookie.
 */
const login = async (payload: TLoginInput): Promise<TLoginResponse> => {
  const { email, password } = payload;

  const user = await UserModel.findOne({ email }).select("+password");
  if (!user) throw new CustomError("Invalid email or password.", 401);

  // Suspended accounts cannot log in
  if (!user.isActive) throw new CustomError("Your account has been suspended. Please contact support.", 403);

  // Social-login accounts have no password — direct them to the correct flow.
  if (!user.password) throw new CustomError("This account uses social login. Please sign in with Google.", 401);

  const isMatch = await HashHelper.comparePassword(password, user.password);
  if (!isMatch) throw new CustomError("Invalid email or password.", 401);

  // If unverified: auto-refresh the verification token so the user can always
  // verify regardless of whether their original token has expired.
  if (!user.isVerified) {
    try {
      const token      = uuidv4();
      const verifyLink = `${config.frontend.verify_page_url}?token=${token}&userId=${user._id}`;
      await AuthRedisService.verifyToken.set(user._id.toString(), token);
      await MailUtils.sendMail({
        from   : `${config.appName} <${config.mail.admin_contact_email}>`,
        to     : email,
        subject: "Verify your email address",
        html   : emailTemplates.verifyEmail(verifyLink),
      });
    } catch {
      // Email failure must not prevent the 403 from reaching the client.
      // User can also trigger resend via POST /auth/resend-verification.
      log.warn("Failed to resend verification email on login attempt", { userId: user._id });
    }
    throw new CustomError(
      "Your email address is not verified. A fresh verification link has been sent to your inbox.",
      403,
    );
  }

  const tokenPayload = { uid: user._id.toString(), email: user.email, role: user.role };
  const accessToken  = JwtHelper.signAccessToken(tokenPayload);
  const refreshToken = JwtHelper.signRefreshToken(tokenPayload);

  // Store refresh token in Redis — allows instant revocation on logout
  await AuthRedisService.refreshToken.set(user._id.toString(), refreshToken);

  log.info("User logged in", { userId: user._id });

  return { user: toPublicUser(user), accessToken, refreshToken };
};

// ── Logout ─────────────────────────────────────────────────────────────────
/**
 * Revokes the user's session.
 *
 * Deletes the refresh token from Redis, which prevents it from being used to
 * obtain new access tokens even if the JWT itself has not yet expired.
 */
const logout = async (userId: string): Promise<void> => {
  await AuthRedisService.refreshToken.del(userId);
  log.info("User logged out", { userId });
};

// ── Refresh access token ───────────────────────────────────────────────────
/**
 * Issues a new short-lived access token from a valid refresh token.
 *
 * Business rules:
 * - JWT signature must be valid.
 * - Token must match the value stored in Redis (mitigates stolen token replay
 *   — once a user logs out, the Redis entry is deleted).
 */
const refreshAccessToken = async (token: string): Promise<{ accessToken: string }> => {
  let payload;
  try {
    payload = JwtHelper.verifyRefreshToken(token);
  } catch {
    throw new CustomError("Invalid or expired refresh token.", 401);
  }

  const stored = await AuthRedisService.refreshToken.get(payload.uid as string);
  if (!stored || stored !== token)
    throw new CustomError("Invalid or expired refresh token.", 401);

  const accessToken = JwtHelper.signAccessToken({
    uid  : payload.uid,
    email: payload.email,
    role : payload.role,
  });

  return { accessToken };
};

// ── Forgot password ────────────────────────────────────────────────────────
/**
 * Initiates the password-reset flow.
 *
 * Business rules:
 * - If no account matches the email, the function returns silently (prevents
 *   email enumeration — callers cannot distinguish "found" from "not found").
 * - A 1-hour reset token is stored in Redis and emailed as part of a link.
 */
const forgotPassword = async (email: string): Promise<void> => {
  const user = await UserModel.findOne({ email });
  if (!user) return; // silent — prevents email enumeration

  const token     = uuidv4();
  const resetLink = `${config.frontend.reset_page_url}?token=${token}&userId=${user._id}`;

  await AuthRedisService.resetToken.set(user._id.toString(), token);

  await MailUtils.sendMail({
    from   : `${config.appName} <${config.mail.admin_contact_email}>`,
    to     : email,
    subject: "Reset your password",
    html   : emailTemplates.resetPassword(resetLink),
  });

  log.info("Password reset email sent", { userId: user._id });
};

// ── Reset password ─────────────────────────────────────────────────────────
/**
 * Completes the password-reset flow.
 *
 * Business rules:
 * - Token must exist in Redis and match exactly (1-hour TTL enforced by Redis).
 * - Token is deleted after a successful reset (single-use).
 * - Refresh token is revoked so any stolen session can no longer be used
 *   after the password is changed (same behaviour as changePassword).
 */
const resetPassword = async (userId: string, token: string, password: string): Promise<void> => {
  const stored = await AuthRedisService.resetToken.get(userId);
  if (!stored || stored !== token)
    throw new CustomError("Invalid or expired reset token.", 400);

  const hashed = await HashHelper.generateHashPassword(password);
  await UserModel.findByIdAndUpdate(userId, { password: hashed });

  // Invalidate both tokens — reset is complete, force a fresh login
  await Promise.all([
    AuthRedisService.resetToken.del(userId),
    AuthRedisService.refreshToken.del(userId),
  ]);

  log.info("Password reset successfully", { userId });
};

// ── Verify email ───────────────────────────────────────────────────────────
/**
 * Marks the user account as email-verified.
 *
 * Business rules:
 * - Token must exist in Redis and match exactly (24-hour TTL enforced by Redis).
 * - Token is deleted after successful verification (single-use).
 */
const verifyEmail = async (userId: string, token: string): Promise<void> => {
  const stored = await AuthRedisService.verifyToken.get(userId);
  if (!stored || stored !== token)
    throw new CustomError("Invalid or expired verification token.", 400);

  await UserModel.findByIdAndUpdate(userId, { isVerified: true });
  await AuthRedisService.verifyToken.del(userId);

  log.info("Email verified", { userId });
};

// ── Resend verification email ──────────────────────────────────────────────
/**
 * Re-issues a verification token and resends the email.
 *
 * Business rules:
 * - Returns silently if no account matches (prevents email enumeration — same
 *   pattern as forgotPassword). The client always sees the same success message.
 * - Returns silently if the account is already verified (no error exposed).
 * - Generates a fresh token, overwriting any existing Redis entry.
 */
const resendVerificationEmail = async (email: string): Promise<void> => {
  const user = await UserModel.findOne({ email });
  // Silent return — prevents exposing whether this email is registered
  if (!user || user.isVerified) return;

  const token      = uuidv4();
  const verifyLink = `${config.frontend.verify_page_url}?token=${token}&userId=${user._id}`;

  await AuthRedisService.verifyToken.set(user._id.toString(), token);

  await MailUtils.sendMail({
    from   : `${config.appName} <${config.mail.admin_contact_email}>`,
    to     : email,
    subject: "Verify your email address",
    html   : emailTemplates.verifyEmail(verifyLink),
  });

  log.info("Verification email resent", { userId: user._id });
};

// ── Social auth code ───────────────────────────────────────────────────────
/**
 * Creates a short-lived one-time code that holds both OAuth tokens.
 * The code is a random UUID stored in Redis with a 2-minute TTL.
 * Used to transfer the session from the backend OAuth callback to the frontend
 * without exposing the refresh token in the URL.
 */
const createSocialAuthCode = async (tokens: TSocialCodePayload): Promise<string> => {
  const code = uuidv4();
  await AuthRedisService.socialCode.set(code, tokens);
  return code;
};

/**
 * Claims a social auth code exactly once.
 * Deletes the Redis entry immediately — replaying the same code returns 401.
 */
const claimSocialAuthCode = async (code: string): Promise<TSocialCodePayload> => {
  const payload = await AuthRedisService.socialCode.get(code);
  if (!payload) throw new CustomError("Invalid or expired auth code.", 401);
  await AuthRedisService.socialCode.del(code);
  return payload;
};

// ── Profile picture URL resolution ────────────────────────────────────────
/**
 * Resolves the stored profilePicture value to a displayable URL.
 *
 * If a customDomain is configured the stored value is already a full HTTPS URL.
 * Without a customDomain the stored value is a bare R2 object key — generate a
 * short-lived presigned URL so the client can display it.
 */
const resolveProfilePictureUrl = async (raw: string | null | undefined): Promise<string | null> => {
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;      // already a full URL (custom domain case)
  try {
    return await getPresignedUrl(raw, 3600);   // 1-hour presigned URL
  } catch {
    log.warn("Could not generate presigned URL for profile picture", { key: raw });
    return null;
  }
};

// ── Get current user ───────────────────────────────────────────────────────
/**
 * Returns the profile of the authenticated user.
 * Used by the GET /auth/me endpoint after token validation.
 */
const getMe = async (userId: string): Promise<TUserPublic> => {
  const user = await UserModel.findById(userId);
  if (!user) throw new CustomError("User not found.", 404);
  const publicUser = toPublicUser(user);
  publicUser.profilePicture = await resolveProfilePictureUrl(user.profilePicture);
  return publicUser;
};

// ── Update profile ─────────────────────────────────────────────────────────
/**
 * Updates the user's profile fields and/or profile picture.
 *
 * Business rules:
 * - At least one of: `payload.name` or `file` must be provided (enforced by controller).
 * - If a new profile picture is provided: the old R2 object is deleted first (best effort),
 *   the new image is compressed to WebP and uploaded to R2, and the URL is stored.
 * - Returns the updated public user shape.
 */
const updateProfile = async (
  userId : string,
  payload: TUpdateProfileInput,
  file  ?: { path: string; originalname: string },
): Promise<TUserPublic> => {
  const updates: Partial<Record<string, any>> = {};

  if (payload.name !== undefined) updates.name = payload.name;

  if (file) {
    // Fetch the current doc BEFORE uploading the new image.
    // Using { new: false } in the update below would also work, but reading first
    // lets us abort early (404) before wasting time on the R2 upload.
    const existing = await UserModel.findById(userId);
    if (!existing) throw new CustomError("User not found.", 404);

    // Upload new image first, then delete the old one.
    // Order matters: if the upload fails we throw before touching R2, leaving
    // the user's current picture intact.
    const { fileUrl } = await uploadProfileImageToR2(file.path, file.originalname);
    updates.profilePicture = fileUrl;

    // Delete old picture after a successful upload (best-effort, non-blocking)
    if (existing.profilePicture) {
      deleteFromR2(existing.profilePicture).catch(() => {
        log.warn("Could not delete old profile picture", { userId, url: existing.profilePicture });
      });
    }
  }

  // Single atomic update — no second findById needed
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true },
  );
  if (!user) throw new CustomError("User not found.", 404);

  log.info("Profile updated", { userId, fields: Object.keys(updates) });
  const publicUser = toPublicUser(user);
  publicUser.profilePicture = await resolveProfilePictureUrl(user.profilePicture);
  return publicUser;
};

// ── Change password ────────────────────────────────────────────────────────
/**
 * Changes the user's password and invalidates all active sessions.
 *
 * Business rules:
 * - Current password must be correct.
 * - On success: refresh token deleted from Redis (forces re-login on all devices).
 *   The controller also clears the session cookie.
 */
const changePassword = async (
  userId         : string,
  currentPassword: string,
  newPassword    : string,
): Promise<void> => {
  const user = await UserModel.findById(userId).select("+password");
  if (!user) throw new CustomError("User not found.", 404);

  if (!user.password) throw new CustomError("This account uses social login and has no password to change.", 400);

  const isMatch = await HashHelper.comparePassword(currentPassword, user.password);
  if (!isMatch) throw new CustomError("Current password is incorrect.", 400);

  const hashed = await HashHelper.generateHashPassword(newPassword);
  await UserModel.findByIdAndUpdate(userId, { password: hashed });

  // Invalidate all sessions — forces re-login on all devices
  await AuthRedisService.refreshToken.del(userId);

  log.info("Password changed", { userId });
};

export const AuthService = {
  register,
  login,
  logout,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  getMe,
  updateProfile,
  changePassword,
  createSocialAuthCode,
  claimSocialAuthCode,
};
