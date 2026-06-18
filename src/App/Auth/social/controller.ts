/*
  Social login controllers — one pair of handlers per OAuth provider.

  Dynamic redirect origin:
    The frontend passes its own origin as ?origin= when hitting the auth endpoint,
    e.g. GET /api/v1/auth/social/google?origin=https://demo.talkhead.ai
    The backend validates it against CORS_ALLOWED_ORIGINS, then encodes it in the
    OAuth `state` parameter. Google returns the state unchanged in the callback, so
    the backend knows exactly which frontend to redirect to — no hardcoded URL needed.

    Fallback: if no ?origin= is supplied, FRONTEND_SOCIAL_CALLBACK_URL is used.

  Adding a new provider:
    1. Add strategy file  → social/strategies/<provider>.strategy.ts
    2. Import strategy    → app.ts  (one line, side-effect import)
    3. Add two handlers   → copy a Google block below, change "google" to the provider
    4. Export handlers    → add to SocialAuthController at the bottom
    5. Register routes    → social/routes.ts
*/

import config from "@/Config";
import CustomError from "@/Utils/errors/customError.class";
import catchAsync from "@/Utils/helper/catchAsync";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { NextFunction, Request, Response } from "express";
import passport from "passport";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  SESSION_INFO_COOKIE_NAME,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getSessionInfoCookieOptions,
} from "../const";
import { AuthService } from "../service";
import { toSessionInfo } from "../utils";
import { TClaimSocialCodeBody } from "../types";

const { set: refreshCookieOptions     } = getRefreshTokenCookieOptions(config.auth.cookie);
const { set: accessCookieOptions      } = getAccessTokenCookieOptions(config.auth.cookie);
const { set: sessionInfoCookieOptions } = getSessionInfoCookieOptions(config.auth.cookie);

// ── Shared helpers ─────────────────────────────────────────────────────────────

/**
 * Validates that `origin` is in the CORS_ALLOWED_ORIGINS whitelist.
 * Returns the origin if valid, null otherwise.
 */
const validateOrigin = (origin: string | undefined): string | null => {
  if (!origin) return null;
  try {
    const { origin: normalised } = new URL(origin); // strips trailing slash / path
    return config.cors.allowed_origins.includes(normalised) ? normalised : null;
  } catch {
    return null;
  }
};

/**
 * Builds the redirect URL back to the frontend callback page.
 *
 * `frontendOrigin` comes from the validated OAuth `state` parameter.
 * Falls back to FRONTEND_SOCIAL_CALLBACK_URL for clients that didn't pass ?origin=.
 */
const buildCallbackUrl = (frontendOrigin: string | null): string => {
  const base = frontendOrigin
    ? `${frontendOrigin}/auth/callback`
    : (config.frontend.social_callback_url ?? config.frontend.verify_page_url);
  return base;
};

const redirectToFrontend = (
  res: Response,
  result: { code?: string; error?: string },
  frontendOrigin: string | null,
): void => {
  const url = new URL(buildCallbackUrl(frontendOrigin));
  if (result.code)  url.searchParams.set("code",  result.code);
  if (result.error) url.searchParams.set("error", result.error);
  res.redirect(url.toString());
};

// ── Google ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/auth/social/google?origin=<frontend-origin>
 *
 * Redirects the browser to Google's consent screen.
 * Validates and encodes the ?origin= param in the OAuth state so it can be
 * recovered in the callback without any server-side storage.
 */
const googleAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!config.google) {
    next(new CustomError("Google OAuth is not configured on this server.", 501));
    return;
  }

  const origin      = validateOrigin(req.query.origin as string | undefined);
  // state = validated origin, or empty string (callback falls back to env var)
  const state       = origin ?? "";

  passport.authenticate("google", {
    scope  : ["profile", "email"],
    session: false,
    state,
  })(req, res, next);
};

/**
 * GET /api/v1/auth/social/google/callback
 *
 * Google redirects here with ?state=<origin> (the value we passed in googleAuth).
 * The state is re-validated so it can never be used as an open redirect.
 */
const googleCallback = (req: Request, res: Response, next: NextFunction): void => {
  // Re-validate: never trust state blindly even though we set it ourselves
  const frontendOrigin = validateOrigin(req.query.state as string | undefined);

  passport.authenticate(
    "google",
    { session: false },
    async (err: Error | null, oauthUser: Express.User | false) => {
      if (err || !oauthUser) {
        redirectToFrontend(res, { error: err?.message ?? "Google authentication failed." }, frontendOrigin);
        return;
      }
      try {
        const code = await AuthService.createSocialAuthCode({
          accessToken : oauthUser.accessToken!,
          refreshToken: oauthUser.refreshToken!,
          user        : oauthUser.user!,
        });
        redirectToFrontend(res, { code }, frontendOrigin);
      } catch {
        redirectToFrontend(res, { error: "Failed to create auth session. Please try again." }, frontendOrigin);
      }
    },
  )(req, res, next);
};

/**
 * POST /api/v1/auth/social/claim
 *
 * Exchanges a one-time auth code for both tokens (sets httpOnly cookies).
 * The Next.js route handler forwards these Set-Cookie headers so the browser
 * stores them for the frontend domain, not dev-api.talkhead.ai.
 */
const claimSocialCode = catchAsync(async (req: Request, res: Response) => {
  const { code } = req.body as TClaimSocialCodeBody;
  const tokens = await AuthService.claimSocialAuthCode(code);

  res.cookie(ACCESS_COOKIE_NAME,       tokens.accessToken,         accessCookieOptions);
  res.cookie(REFRESH_COOKIE_NAME,      tokens.refreshToken,        refreshCookieOptions);
  res.cookie(SESSION_INFO_COOKIE_NAME, toSessionInfo(tokens.user), sessionInfoCookieOptions);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Social login successful.",
    req,
  });
});

export const SocialAuthController = {
  googleAuth,
  googleCallback,
  claimSocialCode,
};
