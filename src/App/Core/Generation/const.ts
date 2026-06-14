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
} as const;

export type TGenerationInputType = typeof GenerationInputType[keyof typeof GenerationInputType];
export const GenerationInputTypeValues = Object.values(GenerationInputType) as [TGenerationInputType, ...TGenerationInputType[]];

// ── Test mode ──────────────────────────────────────────────────────────────
// When mode=test is passed at generation creation, the queue processor skips
// the external API call and immediately marks the job completed with this key.
export const GENERATION_TEST_OUTPUT_KEY =
  "generations/6a2376982deea03e9de2aa8e/c0222feb-fb21-4b3c-a108-94a856ea4f88.mp4" as const;

// ── Redis / cache prefixes (if needed in future) ───────────────────────────
export const GENERATION_CACHE_PREFIX = "generation" as const;
