import config from "@/Config";
import CustomError from "@/Utils/errors/customError.class";
import catchAsync from "@/Utils/helper/catchAsync";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { Request, Response } from "express";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  SESSION_INFO_COOKIE_NAME,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getSessionInfoCookieOptions,
} from "./const";
import { AuthService } from "./service";
import { toSessionInfo } from "./utils";
import {
  TChangePasswordBody,
  TForgotPasswordBody,
  TLoginBody,
  TRegisterBody,
  TResendVerificationBody,
  TResetPasswordBody,
  TUpdateProfileBody,
  TVerifyEmailBody,
} from "./types";

const { set: refreshCookieOptions,     clear: clearRefreshCookieOptions     } = getRefreshTokenCookieOptions(config.auth.cookie);
const { set: accessCookieOptions,      clear: clearAccessCookieOptions      } = getAccessTokenCookieOptions(config.auth.cookie);
const { set: sessionInfoCookieOptions, clear: clearSessionInfoCookieOptions } = getSessionInfoCookieOptions(config.auth.cookie);

// ── Public endpoints ───────────────────────────────────────────────────────

/** POST /api/v1/auth/register */
const register = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TRegisterBody;

  await AuthService.register({
    name: body.name,
    email: body.email,
    password: body.password,
  });

  sendResponse.success(res, {
    statusCode: 201,
    message: "Account created successfully. Please check your email to verify your account.",
    req,
  });
});

/** POST /api/v1/auth/login */
const login = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TLoginBody;

  const { user, accessToken, refreshToken } = await AuthService.login({
    email: body.email,
    password: body.password,
  });

  // Both tokens delivered as httpOnly cookies — zero client-side token management needed.
  // access_token  short-lived (15 min) — refreshed silently by authenticate middleware
  // refresh_token long-lived  (7 days) — used only for silent refresh, never read by JS
  res.cookie(ACCESS_COOKIE_NAME,       accessToken,           accessCookieOptions);
  res.cookie(REFRESH_COOKIE_NAME,      refreshToken,          refreshCookieOptions);
  res.cookie(SESSION_INFO_COOKIE_NAME, toSessionInfo(user),   sessionInfoCookieOptions);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Login successful.",
    data: { user, accessToken },   // accessToken still returned in body for mobile/API clients
    req,
  });
});

/** POST /api/v1/auth/logout */
const logout = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;

  if (token) {
    try {
      // Verify the token to extract userId, then remove from Redis
      const payload = JwtHelper.verifyRefreshToken(token);
      await AuthService.logout(payload.uid as string);
    } catch {
      // Already expired or tampered — still clear the cookie below
    }
  }

  res.clearCookie(ACCESS_COOKIE_NAME,       clearAccessCookieOptions);
  res.clearCookie(REFRESH_COOKIE_NAME,      clearRefreshCookieOptions);
  res.clearCookie(SESSION_INFO_COOKIE_NAME, clearSessionInfoCookieOptions);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Logged out successfully.",
    req,
  });
});

/** POST /api/v1/auth/refresh-token */
const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
  if (!token) throw new CustomError("Refresh token is required.", 401);

  const { accessToken } = await AuthService.refreshAccessToken(token);

  // Refresh the access_token cookie so web clients stay in sync
  res.cookie(ACCESS_COOKIE_NAME, accessToken, accessCookieOptions);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Token refreshed successfully.",
    data: { accessToken },   // also in body for mobile clients
    req,
  });
});

/** POST /api/v1/auth/forgot-password */
const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TForgotPasswordBody;
  await AuthService.forgotPassword(body.email);

  // Always return the same message regardless of whether the email was found
  sendResponse.success(res, {
    statusCode: 200,
    message: "If an account with that email exists, a password reset link has been sent.",
    req,
  });
});

/** POST /api/v1/auth/reset-password */
const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TResetPasswordBody;
  await AuthService.resetPassword(body.userId, body.token, body.password);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Password reset successfully.",
    req,
  });
});

/** POST /api/v1/auth/verify-email */
const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TVerifyEmailBody;
  await AuthService.verifyEmail(body.userId, body.token);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Email verified successfully.",
    req,
  });
});

/** POST /api/v1/auth/resend-verification */
const resendVerification = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TResendVerificationBody;
  await AuthService.resendVerificationEmail(body.email);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Verification email sent successfully.",
    req,
  });
});

// ── Protected endpoints (require authenticate middleware) ──────────────────

/** GET /api/v1/auth/me */
const getMe = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.uid;
  const user = await AuthService.getMe(userId);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Profile fetched successfully.",
    data: user,
    req,
  });
});

/**
 * PATCH /api/v1/auth/profile
 *
 * Handles both JSON (name update) and multipart/form-data (name + profilePicture).
 * multer runs before this handler, populating req.file if a picture was attached.
 */
const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.uid;
  const body = req.body as TUpdateProfileBody;

  // Require at least one field — multer may not be active for JSON requests
  if (!req.file && !body.name && body.country === undefined) {
    throw new CustomError("At least one field is required to update (name, country, or profilePicture).", 400);
  }

  const user = await AuthService.updateProfile(
    userId,
    { name: body.name, country: body.country },
    req.file ?? undefined,
  );

  sendResponse.success(res, {
    statusCode: 200,
    message: "Profile updated successfully.",
    data: user,
    req,
  });
});

/** PATCH /api/v1/auth/change-password */
const changePassword = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.uid;
  const body = req.body as TChangePasswordBody;

  await AuthService.changePassword(userId, body.currentPassword, body.newPassword);

  // Clear both cookies — user must log in again
  res.clearCookie(ACCESS_COOKIE_NAME,  clearAccessCookieOptions);
  res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Password changed successfully. Please log in again.",
    req,
  });
});

export const AuthController = {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  getMe,
  updateProfile,
  changePassword,
};
