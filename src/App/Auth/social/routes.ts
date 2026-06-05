/*
  Social / OAuth login routes — one section per provider.

  Mounted at /api/v1/auth in Routes/index.ts, so the full paths are:
    GET /api/v1/auth/google          → redirect to Google consent
    GET /api/v1/auth/google/callback → receive Google redirect, issue tokens

  Adding a new provider (e.g. GitHub):
    1.  pnpm add passport-github2 && pnpm add -D @types/passport-github2
    2.  Add GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET to .env + .env.example
    3.  Add optional github config block to src/Config/index.ts
    4.  Add githubId?: string to src/App/Auth/model.ts + types.ts
    5.  Create src/App/Auth/social/strategies/github.strategy.ts
    6.  Import the strategy in src/app.ts  (one side-effect import line)
    7.  Add githubAuth + githubCallback to src/App/Auth/social/controller.ts
    8.  Uncomment the GitHub section below
*/

import { Router } from "express";
import { SocialAuthController } from "./controller";

const socialRouter = Router();

// ── Google ────────────────────────────────────────────────────────────────────
socialRouter
  .get("/google",          SocialAuthController.googleAuth)
  .get("/google/callback", SocialAuthController.googleCallback);

// ── GitHub ────────────────────────────────────────────────────────────────────
// socialRouter
//   .get("/github",          SocialAuthController.githubAuth)
//   .get("/github/callback", SocialAuthController.githubCallback);

export default socialRouter;
