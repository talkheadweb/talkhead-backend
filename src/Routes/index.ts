import authRouter from "@/App/Auth/routes";
import { Router } from "express";

const rootRouter = Router();

rootRouter.use("/auth", authRouter);

export default rootRouter;
