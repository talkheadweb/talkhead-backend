import authRouter   from "@/App/Auth/routes";
import socialRouter from "@/App/Auth/social/routes";
import { Router } from "express";

const rootRouter = Router();

rootRouter.use("/auth", authRouter);   // email/password auth
rootRouter.use("/auth", socialRouter); // social / OAuth login (Google, GitHub, …)

// ── Feature routes ────────────────────────────────────────────────────────────
// Add new feature modules here:
//   import featureRouter from "@/App/Feature/routes";
//   rootRouter.use("/features", featureRouter);

export default rootRouter;
