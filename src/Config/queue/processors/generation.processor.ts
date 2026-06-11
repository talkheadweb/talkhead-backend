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

  // 1. Mark as processing
  await GenerationService.markProcessing(recordId);
  log.info("Generation job processing", { recordId, jobId: job.id });

  // 2. Send to the Kokoro external service to begin async processing.
  //    Kokoro will call POST /api/v1/generations/:id/callback when done.
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
    await GenerationService.markFailed(recordId, `External API ${response.status}: ${errorText}`);
    throw new Error(`External API responded with ${response.status}: ${errorText}`);
  }

  // Kokoro accepted the job — completion/failure arrives via the callback webhook.
  log.info("Generation job sent to Kokoro, awaiting callback", { recordId, jobId: job.id });
};
