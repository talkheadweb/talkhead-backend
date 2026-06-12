/**
 * Queue processor registry — the single entry point for the BullMQ worker.
 *
 * Every job flows through `processQueueJob`. It reads `payload.type` and
 * delegates to the appropriate feature processor.
 *
 * ── Adding a new processor (plug-and-play) ───────────────────────────────
 *
 *   1. Add the new type constant to src/Config/queue/const.ts:
 *              MY_FEATURE: "my-feature",
 *
 *   2. Create  src/Config/queue/processors/<feature>.processor.ts
 *              Export: handleMyFeatureJob(job: Job<TQueueJobData>): Promise<void>
 *              Rule: NO direct DB access — call the feature's service methods only.
 *
 *   3. Import it here and add one case to the switch:
 *              case QueueJobType.MY_FEATURE:
 *                return handleMyFeatureJob(job);
 *
 *   That's it — no other files need to change.
 *
 * ── Processor contract ───────────────────────────────────────────────────
 *
 *   Every processor MUST follow this lifecycle:
 *     a. markProcessing(recordId)
 *     b. POST to external API — await the response
 *     c. Response { success: true,  outputUrl } → markCompleted(recordId, outputUrl)
 *        Response { success: false, message  } → markFailed(recordId, message) + throw
 *        Network / HTTP error                  → markFailed(recordId, msg)    + throw
 *        (throw causes BullMQ to retry up to 3× with exponential backoff)
 */

import { Job } from "bullmq";
import config from "@/Config";
import { LogService } from "@/Config/logger/utils";
import { QueueJobType } from "@/Config/queue/const";
import type { TQueueJobData } from "../types";

// ── Feature processors ─────────────────────────────────────────────────────
import { handleGenerationJob } from "./generation.processor";
// import { handleMyFeatureJob } from "./myFeature.processor";   ← add here

const log = LogService.APPLICATION;

// ── Main router ────────────────────────────────────────────────────────────
export const processQueueJob = async (job: Job<TQueueJobData>): Promise<void> => {
  const { type, recordId, payload } = job.data;

  log.info("Queue job received", { recordId, jobId: job.id, type });

  switch (type) {
    case QueueJobType.GENERATION:
      return handleGenerationJob(job);

    default:
      // Unknown type — forward to external API as raw passthrough (no record update)
      log.warn("Unknown job type — forwarding to external API without record update", { type, recordId });
      const response = await fetch(config.queue.external_api_url, {
        method : "POST",
        headers: { "Content-Type": "application/json", "x-api-key": config.queue.api_key },
        body   : JSON.stringify({ recordId, payload }),
      });
      if (!response.ok) {
        const err = await response.text().catch(() => "unknown");
        throw new Error(`External API responded with ${response.status}: ${err}`);
      }
  }
};
