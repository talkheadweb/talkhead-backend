/*
  Express application factory.
  Pure setup — no side-effects, no startup logic.
  All startup logic (DB, Redis, bootstrap) lives in src/index.ts.
*/

import morganMiddleware from "@/Middlewares/Debug/morganMiddleware";
import globalErrorHandler from "@/Middlewares/Errors/globalErrorHandler";
import notFoundHandler from "@/Middlewares/Errors/notFoundHandler";
import { swaggerSpec } from "@/Config/swagger";
import config from "@/Config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application } from "express";
import swaggerUi from "swagger-ui-express";
import configRoutes from "./Routes/config";

const app: Application = express();

const allowedOrigins = config.cors.allowed_origins
  .flatMap((value) => {
    try {
      return [new URL(value).origin];
    } catch {
      return [];
    }
  })
  .filter((value, index, arr) => value && arr.indexOf(value) === index);

app.use(morganMiddleware);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// ── API documentation ──────────────────────────────────────────────────────
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "talkhead API Docs",
  swaggerOptions  : { persistAuthorization: true },
}));

// ── Application routes ─────────────────────────────────────────────────────
app.use("/", configRoutes);

// ── Error handlers (must be last) ─────────────────────────────────────────
app.use(globalErrorHandler);
app.use(notFoundHandler);

export default app;
