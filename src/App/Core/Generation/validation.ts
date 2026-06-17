import { z } from "zod";
import { GenerationInputTypeValues, GenerationStatusValues } from "./const";

// ── Create — multipart/form-data ───────────────────────────────────────────
// Files (avatarImage, inputAudio) are handled by multer, not Zod.
// Body fields are validated here; file-presence rules are checked in the controller.
export const createGenerationSchema = z.object({
  query: z.object({
    mode: z.literal("test").optional(),
  }),
  body: z.object({
    inputType      : z.enum(GenerationInputTypeValues, { required_error: "inputType is required" }),
    voiceId        : z.string().min(1, "voiceId is required"),
    inputText      : z.string().min(1).max(5000).optional(),
    avatarImageKey : z.string().min(1).optional(),
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

// ── Update — admin fields + user label/tags (access enforced in controller) ─
export const updateGenerationSchema = z.object({
  body: z.object({
    // Admin-only fields
    status       : z.enum(GenerationStatusValues).optional(),
    outputFileKey: z.string().min(1).optional(),
    errorMessage : z.string().optional(),
    completedAt  : z.coerce.date().optional(),
    // User-editable fields
    label        : z.string().max(100).optional(),
    tags         : z.array(z.string().max(50)).max(20).optional(),
  }).refine(d => Object.values(d).some(v => v !== undefined), {
    message: "Provide at least one field to update",
  }),
});

// ── External API callback ──────────────────────────────────────────────────
export const callbackGenerationSchema = z.object({
  body: z.object({
    success      : z.boolean({ required_error: "success is required" }),
    outputFileKey: z.string().min(1).optional(),
    message      : z.string().optional(),
  }),
});
