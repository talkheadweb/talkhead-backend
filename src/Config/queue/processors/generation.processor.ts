/**
 * Generation job processor.
 *
 * Flow:
 *   1. markProcessing(recordId)
 *   2. callGenerationApi(payload) — real HTTP in prod, mock response in dev
 *   3. success=true  → markCompleted(recordId, outputUrl)
 *      success=false → markFailed(recordId, message) + throw (BullMQ retries)
 *
 * Rule: NO direct DB operations here.
 * All persistence is delegated to GenerationService worker-callback methods.
 */

import { Job } from "bullmq";
import config from "@/Config";
import { ENodeEnv } from "@/Config/utils/config.types";
import { LogService } from "@/Config/logger/utils";
import { GenerationService } from "@/App/Core/Generation/service";
import type { TQueueJobData } from "../types";

const log = LogService.APPLICATION;

type TJobResponse = {
  success  : boolean;
  outputUrl?: string;
  message? : string;
};

// ── API caller — switches on environment ───────────────────────────────────

const callGenerationApi = async (
  recordId: string,
  payload : Record<string, unknown>,
): Promise<TJobResponse> => {
  // Dev: return a mock response — no real HTTP call
  if (config.node_env !== ENodeEnv.PROD) {
    return {
      success  : true,
      outputUrl: `https://cdn.example.com/outputs/${recordId}.mp4`,
    };
  }

  // Prod: call the real external endpoint
  const response = await fetch(config.queue.external_api_url, {
    method : "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key"   : config.queue.api_key,
    },
    body: JSON.stringify({ recordId, payload }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new Error(`External API responded with ${response.status}: ${text}`);
  }

  return response.json() as Promise<TJobResponse>;
};

// ── Processor ──────────────────────────────────────────────────────────────

export const handleGenerationJob = async (job: Job<TQueueJobData>): Promise<void> => {
  const { recordId, payload } = job.data;

  await GenerationService.markProcessing(recordId);
  log.info("Generation job processing", { recordId, jobId: job.id });

  let result: TJobResponse;
  try {
    result = await callGenerationApi(recordId, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "External API call failed";
    await GenerationService.markFailed(recordId, msg);
    log.error("Generation job — API error", { recordId, error: msg });
    throw err;   // BullMQ retries up to 3×
  }

  if (result.success) {
    await GenerationService.markCompleted(recordId, result.outputUrl);
    log.info("Generation job completed", { recordId, outputUrl: result.outputUrl });
  } else {
    const msg = result.message ?? "External service reported failure";
    await GenerationService.markFailed(recordId, msg);
    log.warn("Generation job failed via API response", { recordId, msg });
    throw new Error(msg);   // BullMQ retries
  }
};
