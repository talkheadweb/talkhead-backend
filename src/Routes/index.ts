import authRouter from "@/App/Auth/routes";
import { Router } from "express";

const rootRouter = Router();

rootRouter.use("/auth", authRouter);

// ── Feature routes ────────────────────────────────────────────────────────────
// Add new feature modules here:
//   import featureRouter from "@/App/Feature/routes";
//   rootRouter.use("/features", featureRouter);

export default rootRouter;
