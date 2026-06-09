import { z } from "zod";
import {
  GenerationInputTypeValues,
  GenerationOutputTypeValues,
  GenerationStatusValues,
} from "./const";

// ── Create ─────────────────────────────────────────────────────────────────
export const createGenerationSchema = z.object({
  body: z.object({
    inputType        : z.enum(GenerationInputTypeValues,  { required_error: "inputType is required" }),
    outputType       : z.enum(GenerationOutputTypeValues, { required_error: "outputType is required" }),
    inputText        : z.string().min(1).max(5000).optional(),
    referenceImageUrl: z.string().url("referenceImageUrl must be a valid URL").optional(),
  }),
});

// ── Update (status / result fields — used by worker callback or admin) ─────
export const updateGenerationSchema = z.object({
  body: z.object({
    status      : z.enum(GenerationStatusValues).optional(),
    audioUrl    : z.string().url().optional(),
    videoUrl    : z.string().url().optional(),
    ysid        : z.string().optional(),
    errorMessage: z.string().optional(),
    completedAt : z.coerce.date().optional(),
  }),
});
