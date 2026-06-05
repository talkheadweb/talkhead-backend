/*
  Express application factory.
  Pure setup — no side-effects, no startup logic.
  All startup logic (DB, Redis, bootstrap) lives in src/index.ts.
*/

import "@/App/Auth/social/strategies/google.strategy"; // registers passport strategies (side-effect)
import morganMiddleware from "@/Middlewares/Debug/morganMiddleware";
import passport from "passport";
import globalErrorHandler from "@/Middlewares/Errors/globalErrorHandler";
import notFoundHandler from "@/Middlewares/Errors/notFoundHandler";
import { swaggerSpec } from "@/Config/swagger";
import { ENodeEnv } from "@/Config/utils/config.types";
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
app.use(passport.initialize()); // stateless — no sessions; needed for OAuth flows
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    // If no origins are configured, deny all cross-origin requests (fail closed).
    // Set CORS_ALLOWED_ORIGINS=* explicitly to allow all origins in development.
    if (allowedOrigins.length === 0) return cb(new Error("Not allowed by CORS"));
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// ── API documentation (dev only) ───────────────────────────────────────────
// Swagger UI is disabled in production to avoid exposing internal API shape.
// To re-enable in prod, add authentication in front of this route first.
if (config.node_env !== ENodeEnv.PROD) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "express-ts-starter API Docs",
    swaggerOptions  : { persistAuthorization: true },
  }));
}

// ── Application routes ─────────────────────────────────────────────────────
app.use("/", configRoutes);

// ── Error handlers (must be last) ─────────────────────────────────────────
// notFoundHandler is a regular middleware — must come BEFORE globalErrorHandler.
// globalErrorHandler is a 4-argument error handler — must be absolute last.
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
