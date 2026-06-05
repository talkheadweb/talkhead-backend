/*
  Social login controllers — one pair of handlers per OAuth provider.

  Flow for every provider:
    1. <provider>Auth     — redirects the browser to the provider's consent page.
    2. <provider>Callback — provider redirects here; passport strategy resolves
                            the identity; tokens are issued; browser is redirected to:
                              FRONTEND_SOCIAL_CALLBACK_URL?token=<accessToken>
                            On failure:
                              FRONTEND_SOCIAL_CALLBACK_URL?error=<message>

  The ?token= value is the standard JWT access token — identical to what
  POST /auth/login returns in its JSON body.  The refresh token is set as
  an httpOnly cookie in the same step.  From the frontend's perspective the
  user is fully logged in after reading this token — no difference from a
  normal email/password login.

  Adding a new provider:
    1. Add strategy file  → social/strategies/<provider>.strategy.ts
    2. Import strategy    → app.ts  (one line, side-effect import)
    3. Add two handlers   → copy a Google block below, change "google" to the provider
    4. Export handlers    → add to SocialAuthController at the bottom
    5. Register routes    → social/routes.ts
*/

import config from "@/Config";
import CustomError from "@/Utils/errors/customError.class";
import { NextFunction, Request, Response } from "express";
import passport from "passport";
import { COOKIE_NAME, getRefreshTokenCookieOptions } from "../const";

const { set: cookieOptions } = getRefreshTokenCookieOptions(config.auth.cookie);

// ── Shared helper ──────────────────────────────────────────────────────────────

/**
 * Redirect the browser to the frontend social-callback page.
 * All providers use the same page — the token format is identical regardless
 * of how the user authenticated.
 *
 *   Success:  FRONTEND_SOCIAL_CALLBACK_URL?token=<accessToken>
 *   Failure:  FRONTEND_SOCIAL_CALLBACK_URL?error=<message>
 */
const redirectToFrontend = (res: Response, result: { token?: string; error?: string }): void => {
  const base = config.frontend.social_callback_url ?? config.frontend.verify_page_url;
  const url  = new URL(base);
  if (result.token) url.searchParams.set("token", result.token);
  if (result.error) url.searchParams.set("error", result.error);
  res.redirect(url.toString());
};

// ── Google ─────────────────────────────────────────────────────────────────────

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
 *
 * Google redirects here after the user grants (or denies) access.
 *
 * What happens inside:
 *   1. Passport exchanges the ?code= for a Google profile (Google API call).
 *   2. The strategy calls SocialAuthService.socialLogin → finds or creates the user.
 *   3. Access + refresh tokens are issued (same JWT format as normal login).
 *   4. Refresh token → httpOnly cookie  (browser stores it automatically).
 *   5. Access token  → ?token= in the frontend redirect.
 */
const googleCallback = (req: Request, res: Response, next: NextFunction): void => {
  passport.authenticate(
    "google",
    { session: false },
    (err: Error | null, oauthUser: Express.User | false) => {
      if (err || !oauthUser) {
        redirectToFrontend(res, { error: err?.message ?? "Google authentication failed." });
        return;
      }
      res.cookie(COOKIE_NAME, oauthUser.refreshToken!, cookieOptions);
      redirectToFrontend(res, { token: oauthUser.accessToken! });
    },
  )(req, res, next);
};

// ── Add more providers below ───────────────────────────────────────────────────
// Each provider is just two functions: Auth (redirect) + Callback (handle result).
// See social/routes.ts for the full checklist.

export const SocialAuthController = {
  googleAuth,
  googleCallback,
};
