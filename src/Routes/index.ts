import authRouter       from "@/App/Auth/routes";
import socialRouter     from "@/App/Auth/social/routes";
import adminRouter      from "@/App/Admin/routes";
import queueRouter      from "@/App/Queue/routes";
import generationRouter from "@/App/Core/Generation/routes";
import avatarRouter     from "@/App/Avatar/routes";
import { Router } from "express";

const rootRouter = Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
rootRouter.use("/auth",        authRouter);          // email/password
rootRouter.use("/auth/social", socialRouter);        // OAuth (Google, GitHub, …)

// ── Admin ─────────────────────────────────────────────────────────────────────
rootRouter.use("/admin", adminRouter);

// ── Queue ─────────────────────────────────────────────────────────────────────
rootRouter.use("/queue", queueRouter);

// ── Core modules ──────────────────────────────────────────────────────────────
rootRouter.use("/generations", generationRouter);

// ── Feature routes ────────────────────────────────────────────────────────────
rootRouter.use("/avatars", avatarRouter);

// Add new feature modules here:
//   import featureRouter from "@/App/Feature/routes";
//   rootRouter.use("/features", featureRouter);

export default rootRouter;
