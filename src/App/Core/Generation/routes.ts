import { Router } from "express";
import { EUserRole } from "@/App/Auth/types";
import authenticate from "@/Middlewares/Auth";
import AccessLimit from "@/Middlewares/AccessLimit";
import apiKeyAuth from "@/Middlewares/ApiKey";
import validateRequest from "@/Middlewares/validateRequest";
import { generationUpload } from "@/Utils/file/config";
import { GenerationController } from "./controller";
import {
  createGenerationSchema,
  updateGenerationSchema,
  callbackGenerationSchema,
} from "./validation";

const generationRouter = Router();

// ── Kokoro callback — no user auth, API key only ───────────────────────────
// Registered before `authenticate` so it is not guarded by JWT.
generationRouter.post(
  "/:id/callback",
  apiKeyAuth,
  validateRequest(callbackGenerationSchema),
  GenerationController.callback,
);

// ── All remaining routes require a valid access token ─────────────────────
generationRouter.use(authenticate);

// POST   /api/v1/generations        — create + enqueue (any authenticated user)
generationRouter.post(
  "/",
  generationUpload.fields([
    { name: "referenceImage", maxCount: 1 },
    { name: "inputAudio",     maxCount: 1 },
  ]),
  validateRequest(createGenerationSchema),
  GenerationController.create,
);

// GET    /api/v1/generations        — list (user sees own; admin sees all)
generationRouter.get("/", GenerationController.list);

// GET    /api/v1/generations/:id    — get one (owner or admin)
generationRouter.get("/:id", GenerationController.getOne);

// PATCH  /api/v1/generations/:id    — update status / result (admin only)
generationRouter.patch(
  "/:id",
  AccessLimit([EUserRole.ADMIN]),
  validateRequest(updateGenerationSchema),
  GenerationController.update,
);

// PATCH  /api/v1/generations/:id/cancel — cancel pending job (owner or admin)
generationRouter.patch("/:id/cancel", GenerationController.cancel);

// DELETE /api/v1/generations/:id    — hard delete (admin only)
generationRouter.delete("/:id", AccessLimit([EUserRole.ADMIN]), GenerationController.remove);

export default generationRouter;
