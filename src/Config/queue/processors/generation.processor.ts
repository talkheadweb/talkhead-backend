/**
 * Generation job processor — fire-and-forget trigger.
 *
 * Flow:
 *   1. markProcessing(recordId)
 *   2. POST trigger to external API — await only HTTP acceptance (2xx), then exit
 *   3. External API processes asynchronously and calls back to
 *      POST /api/v1/generations/:recordId/callback when done
 *
 * If the trigger HTTP call fails (non-2xx or network error):
 *   - markFailed(recordId, message)
 *   - throw → BullMQ retries up to 3× with exponential backoff
 *
 * Rule: NO direct DB operations here.
 * All persistence is delegated to GenerationService worker-callback methods.
 */

import { Job } from "bullmq";
import config from "@/Config";
import { LogService } from "@/Config/logger/utils";
import { GenerationService } from "@/App/Core/Generation/service";
import { GENERATION_TEST_OUTPUT_KEY } from "@/App/Core/Generation/const";
import type { TQueueJobData } from "../types";

const log = LogService.APPLICATION;

// ── Trigger ────────────────────────────────────────────────────────────────
// Sends the job payload to the external API and returns as soon as it is
// accepted (2xx). Does NOT wait for the actual generation to complete.
// The external API must call back to callbackUrl when processing finishes.

const triggerExternalApi = async (
  recordId: string,
  payload : Record<string, unknown>,
): Promise<void> => {
  const callbackUrl = `${config.backend_base_url}/api/v1/generations/${recordId}/callback`;

  const response = await fetch(config.queue.external_api_url, {
    method : "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key"   : config.queue.api_key,
    },
    body: JSON.stringify({ recordId, callbackUrl, payload }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new Error(`External API trigger failed with ${response.status}: ${text}`);
  }
};

// ── Processor ──────────────────────────────────────────────────────────────

export const handleGenerationJob = async (job: Job<TQueueJobData>): Promise<void> => {
  const { recordId, payload } = job.data;

  await GenerationService.markProcessing(recordId);

  // Test mode: skip external API, immediately complete with dummy output
  if (payload.mode === "test") {
    log.info("Generation job — test mode, completing with dummy output", { recordId });
    await GenerationService.handleCallback(recordId, {
      success      : true,
      outputFileKey: GENERATION_TEST_OUTPUT_KEY,
    });
    return;
  }

  log.info("Generation job — triggering external API", { recordId, jobId: job.id });

  try {
    await triggerExternalApi(recordId, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to trigger external API";
    await GenerationService.markFailed(recordId, msg);
    log.error("Generation job — trigger failed", { recordId, error: msg });
    throw err;  // BullMQ retries up to 3×
  }

  log.info("Generation job — trigger accepted, awaiting callback", { recordId, jobId: job.id });
};
