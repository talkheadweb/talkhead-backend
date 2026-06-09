/**
 * Generation module constants — single source of truth.
 *
 * NEVER use raw strings like "pending" or "text" in code.
 * Always import from this file so the entire codebase stays consistent.
 *
 * Usage:
 *   import { GenerationStatus, GenerationInputType } from "./const";
 *   job.status = GenerationStatus.PENDING;
 *   if (job.inputType === GenerationInputType.TEXT) { ... }
 */

// ── Job status ─────────────────────────────────────────────────────────────
export const GenerationStatus = {
  PENDING   : "pending",
  PROCESSING: "processing",
  COMPLETED : "completed",
  FAILED    : "failed",
  CANCELLED : "cancelled",
} as const;

export type TGenerationStatus = typeof GenerationStatus[keyof typeof GenerationStatus];
export const GenerationStatusValues = Object.values(GenerationStatus) as [TGenerationStatus, ...TGenerationStatus[]];

// ── Input type ─────────────────────────────────────────────────────────────
export const GenerationInputType = {
  TEXT : "text",
  AUDIO: "audio",
  IMAGE: "image",
  VIDEO: "video",
} as const;

export type TGenerationInputType = typeof GenerationInputType[keyof typeof GenerationInputType];
export const GenerationInputTypeValues = Object.values(GenerationInputType) as [TGenerationInputType, ...TGenerationInputType[]];

// ── Output type ────────────────────────────────────────────────────────────
export const GenerationOutputType = {
  AUDIO: "audio",
  VIDEO: "video",
} as const;

export type TGenerationOutputType = typeof GenerationOutputType[keyof typeof GenerationOutputType];
export const GenerationOutputTypeValues = Object.values(GenerationOutputType) as [TGenerationOutputType, ...TGenerationOutputType[]];

// ── Redis / cache prefixes (if needed in future) ───────────────────────────
export const GENERATION_CACHE_PREFIX = "generation" as const;
