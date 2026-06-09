/**
 * Generation job processor.
 *
 * Handles all jobs with payload.type === QueueJobType.GENERATION.
 *
 * Rule: NO direct DB operations here.
 * All persistence is delegated to GenerationService (markProcessing / markCompleted / markFailed).
 * The processor only orchestrates: call service → call external API → call service.
 */

import { Job } from "bullmq";
import config from "@/Config";
import { LogService } from "@/Config/logger/utils";
import { GenerationService } from "@/App/Core/Generation/service";
import type { TQueueJobData } from "../types";

const log = LogService.APPLICATION;

export const handleGenerationJob = async (job: Job<TQueueJobData>): Promise<void> => {
  const { recordId, payload } = job.data;

  // 1. Delegate status update to the module's own service — no DB here
  await GenerationService.markProcessing(recordId);
  log.info("Generation job processing", { recordId, jobId: job.id });

  // 2. Call the external AI service
  const response = await fetch(config.queue.external_api_url, {
    method : "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key"   : config.queue.api_key,
    },
    body: JSON.stringify({ recordId, payload }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    // Delegate failure update to the module's own service — no DB here
    await GenerationService.markFailed(recordId, `External API ${response.status}: ${errorText}`);
    // Throw so BullMQ retries (up to 3× with exponential backoff)
    throw new Error(`External API responded with ${response.status}: ${errorText}`);
  }

  // 3. Parse result — external service may return URLs in the response body
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;

  // Delegate completion update to the module's own service — no DB here
  await GenerationService.markCompleted(recordId, {
    audioUrl: body?.audioUrl as string | undefined,
    videoUrl: body?.videoUrl as string | undefined,
    ysid    : body?.ysid     as string | undefined,
  });

  log.info("Generation job completed", { recordId, jobId: job.id });
};
