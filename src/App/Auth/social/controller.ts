/*
  Social login controllers — one pair of handlers per OAuth provider.

  Flow for every provider:
    1. <provider>Auth     — redirects the browser to the provider's consent page.
    2. <provider>Callback — provider redirects here; passport strategy resolves
                            the identity; tokens are issued; a short-lived one-time
                            auth code is stored in Redis; browser is redirected to:
                              FRONTEND_SOCIAL_CALLBACK_URL?code=<uuid>
                            On failure:
                              FRONTEND_SOCIAL_CALLBACK_URL?error=<message>

  The frontend's /auth/callback route handler then calls POST /auth/social/claim
  with the code. The backend returns both tokens in the response body so the
  frontend can set them as httpOnly cookies on its own domain. This solves the
  cross-domain cookie problem: cookies set by dev-api.talkhead.ai cannot be read
  by localhost:3000, but tokens returned in a JSON body can be forwarded freely.

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
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
} from "../const";
import { AuthService } from "../service";
import { TClaimSocialCodeBody } from "../types";

const { set: refreshCookieOptions } = getRefreshTokenCookieOptions(config.auth.cookie);
const { set: accessCookieOptions  } = getAccessTokenCookieOptions(config.auth.cookie);

// ── Shared helper ──────────────────────────────────────────────────────────────

const redirectToFrontend = (res: Response, result: { code?: string; error?: string }): void => {
  const base = config.frontend.social_callback_url ?? config.frontend.verify_page_url;
  const url  = new URL(base);
  if (result.code)  url.searchParams.set("code",  result.code);
  if (result.error) url.searchParams.set("error", result.error);
  res.redirect(url.toString());
};

// ── Google ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/auth/social/google
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
 * GET /api/v1/auth/social/google/callback
 *
 * Google redirects here after the user grants (or denies) access.
 *
 * What happens:
 *   1. Passport exchanges the ?code= for a Google profile.
 *   2. Strategy calls SocialAuthService.socialLogin → finds or creates the user.
 *   3. Access + refresh tokens are issued.
 *   4. Both tokens stored in Redis under a random UUID (2-min TTL, single-use).
 *   5. Browser redirected to: FRONTEND_SOCIAL_CALLBACK_URL?code=<uuid>
 *
 * The frontend then calls POST /auth/social/claim to exchange the code for
 * both tokens — which it sets as httpOnly cookies on its own domain.
 */
const googleCallback = (req: Request, res: Response, next: NextFunction): void => {
  passport.authenticate(
    "google",
    { session: false },
    async (err: Error | null, oauthUser: Express.User | false) => {
      if (err || !oauthUser) {
        redirectToFrontend(res, { error: err?.message ?? "Google authentication failed." });
        return;
      }
      try {
        const code = await AuthService.createSocialAuthCode({
          accessToken : oauthUser.accessToken!,
          refreshToken: oauthUser.refreshToken!,
        });
        redirectToFrontend(res, { code });
      } catch {
        redirectToFrontend(res, { error: "Failed to create auth session. Please try again." });
      }
    },
  )(req, res, next);
};

/**
 * POST /api/v1/auth/social/claim
 *
 * Exchanges a one-time auth code (issued by the OAuth callback) for both tokens.
 * The code is deleted from Redis immediately — replaying returns 401.
 *
 * Sets access_token + refresh_token as httpOnly cookies (same as POST /auth/login).
 * The Next.js route handler at /auth/callback forwards these Set-Cookie headers
 * in its own response so the browser stores them for localhost:3000, not for
 * dev-api.talkhead.ai. This works because Express does not set a Domain attribute
 * on the cookie — the browser always binds a domainless cookie to the response origin.
 */
const claimSocialCode = catchAsync(async (req: Request, res: Response) => {
  const { code } = req.body as TClaimSocialCodeBody;
  const tokens = await AuthService.claimSocialAuthCode(code);

  res.cookie(ACCESS_COOKIE_NAME,  tokens.accessToken,  accessCookieOptions);
  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, refreshCookieOptions);

  sendResponse.success(res, {
    statusCode: 200,
    message: "Social login successful.",
    req,
  });
});

// ── Add more providers below ───────────────────────────────────────────────────
// Each provider is just two functions: Auth (redirect) + Callback (handle result).
// See social/routes.ts for the full checklist.

export const SocialAuthController = {
  googleAuth,
  googleCallback,
  claimSocialCode,
};
