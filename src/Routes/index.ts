import authRouter   from "@/App/Auth/routes";
import socialRouter from "@/App/Auth/social/routes";
import { Router } from "express";

const rootRouter = Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
rootRouter.use("/auth",        authRouter);          // email/password
rootRouter.use("/auth/social", socialRouter);        // OAuth (Google, GitHub, …)

// ── Feature routes ────────────────────────────────────────────────────────────
// Add new feature modules here:
//   import featureRouter from "@/App/Feature/routes";
//   rootRouter.use("/features", featureRouter);

export default rootRouter;
