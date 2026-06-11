import { z } from "zod";
import { GenerationInputTypeValues, GenerationStatusValues } from "./const";

// ── Create — multipart/form-data ───────────────────────────────────────────
// Files (referenceImage, inputAudio) are handled by multer, not Zod.
// Body fields are validated here; file-presence rules are checked in the controller.
export const createGenerationSchema = z.object({
  body: z.object({
    inputType        : z.enum(GenerationInputTypeValues, { required_error: "inputType is required" }),
    voiceId          : z.string().min(1, "voiceId is required"),
    inputText        : z.string().min(1).max(5000).optional(),
    referenceImageUrl: z.string().url("referenceImageUrl must be a valid URL").optional(),
  }).superRefine((data, ctx) => {
    if (data.inputType === "text" && !data.inputText) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ["inputText"],
        message: "inputText is required when inputType is text",
      });
    }
  }),
});

// ── Update (admin patch) ───────────────────────────────────────────────────
export const updateGenerationSchema = z.object({
  body: z.object({
    status      : z.enum(GenerationStatusValues).optional(),
    outputUrl   : z.string().url().optional(),
    errorMessage: z.string().optional(),
    completedAt : z.coerce.date().optional(),
  }),
});

// ── Kokoro callback — called by external backend ───────────────────────────
export const callbackGenerationSchema = z.object({
  body: z.object({
    success  : z.boolean({ required_error: "success is required" }),
    outputUrl: z.string().url().optional(),
  }),
});
