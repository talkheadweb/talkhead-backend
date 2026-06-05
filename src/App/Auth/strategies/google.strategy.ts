/*
  Google OAuth 2.0 strategy — registered as a side-effect when this module is imported.

  The strategy:
    1. Receives the verified Google profile from passport.
    2. Delegates find-or-create logic to AuthService.socialLogin.
    3. Passes the resulting TLoginResponse to done() — the controller picks it up
       in the passport.authenticate callback and issues tokens + redirect.

  This file must be imported once at app startup (see src/app.ts).
  It does nothing if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.
*/

import config from "@/Config";
import { LogService } from "@/Config/logger/utils";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { AuthService } from "../service";

const log = LogService.AUTH;

if (config.google) {
  passport.use(
    new GoogleStrategy(
      {
        clientID    : config.google.client_id,
        clientSecret: config.google.client_secret,
        callbackURL : `${config.backend_base_url}/api/v1/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const { user, accessToken, refreshToken } = await AuthService.socialLogin({
            provider  : "google",
            providerId: profile.id,
            email     : profile.emails?.[0]?.value ?? "",
            name      : profile.displayName,
            picture   : profile.photos?.[0]?.value,
          });
          // Pass tokens through passport so the callback controller can redirect
          // without a second DB round-trip.
          done(null, {
            uid         : user._id.toString(),
            email       : user.email,
            role        : user.role,
            accessToken,
            refreshToken,
          });
        } catch (err) {
          log.error("Google OAuth strategy error", err as Error);
          done(err as Error);
        }
      },
    ),
  );

  log.info("Google OAuth strategy registered");
} else {
  log.warn("Google OAuth not configured — GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing");
}
