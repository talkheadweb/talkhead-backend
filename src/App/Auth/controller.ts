import config from "@/Config";
import CustomError from "@/Utils/errors/customError.class";
import catchAsync from "@/Utils/helper/catchAsync";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { NextFunction, Request, Response } from "express";
import passport from "passport";
import { COOKIE_NAME, getRefreshTokenCookieOptions } from "./const";
import { AuthService } from "./service";
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

const { set: cookieOptions, clear: clearCookieOptions } = getRefreshTokenCookieOptions(config.auth.cookie);

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

  // Deliver refresh token as httpOnly cookie (not accessible via JS)
  res.cookie(COOKIE_NAME, refreshToken, cookieOptions);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Login successful.",
    data: { user, accessToken },
    req,
  });
});

/** POST /api/v1/auth/logout */
const logout = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies[COOKIE_NAME] as string | undefined;

  if (token) {
    try {
      // Verify the token to extract userId, then remove from Redis
      const payload = JwtHelper.verifyRefreshToken(token);
      await AuthService.logout(payload.uid as string);
    } catch {
      // Already expired or tampered — still clear the cookie below
    }
  }

  res.clearCookie(COOKIE_NAME, clearCookieOptions);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Logged out successfully.",
    req,
  });
});

/** POST /api/v1/auth/refresh-token */
const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies[COOKIE_NAME] as string | undefined;
  if (!token) throw new CustomError("Refresh token is required.", 401);

  const { accessToken } = await AuthService.refreshAccessToken(token);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Token refreshed successfully.",
    data: { accessToken },
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
  if (!req.file && !body.name) {
    throw new CustomError("At least one field is required to update (name or profilePicture).", 400);
  }

  const user = await AuthService.updateProfile(
    userId,
    { name: body.name },
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

  // Clear session cookie — user must log in again
  res.clearCookie(COOKIE_NAME, clearCookieOptions);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Password changed successfully. Please log in again.",
    req,
  });
});

// ── Google OAuth endpoints ─────────────────────────────────────────────────

/**
 * GET /api/v1/auth/google
 * Redirects the browser to Google's consent screen.
 * Returns 501 if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured.
 */
const googleAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!config.google) {
    next(new CustomError("Google OAuth is not configured on this server.", 501));
    return;
  }
  passport.authenticate("google", { scope: ["profile", "email"], session: false })(req, res, next);
};

/**
 * GET /api/v1/auth/google/callback
 * Google redirects here after the user grants/denies consent.
 * On success: sets httpOnly refresh-token cookie, redirects to frontend with
 * the access token as ?token= query param.
 * On failure: redirects to frontend with ?error= set.
 */
const googleCallback = (req: Request, res: Response, next: NextFunction): void => {
  passport.authenticate(
    "google",
    { session: false },
    (err: Error | null, oauthUser: Express.User | false) => {
      // Determine the redirect base URL — fall back to the verify page if social
      // callback URL is not set (shouldn't happen if Google OAuth is configured).
      const baseUrl = config.frontend.social_callback_url ?? config.frontend.verify_page_url;

      if (err || !oauthUser) {
        const errorUrl = new URL(baseUrl);
        errorUrl.searchParams.set("error", err?.message ?? "Google authentication failed.");
        res.redirect(errorUrl.toString());
        return;
      }

      res.cookie(COOKIE_NAME, oauthUser.refreshToken!, cookieOptions);

      const successUrl = new URL(baseUrl);
      successUrl.searchParams.set("token", oauthUser.accessToken!);
      res.redirect(successUrl.toString());
    },
  )(req, res, next);
};

export const AuthController = {
  register,
  googleAuth,
  googleCallback,
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
