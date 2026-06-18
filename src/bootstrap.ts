import { cleanupTempFiles } from "@/Utils/file/upload";
import { BullWorker, bullQueue } from "@/Config/queue";
import { processQueueJob } from "@/Config/queue/processors";
import { QueueJobType } from "@/Config/queue/const";
import { LogService } from "@/Config/logger/utils";

const log = LogService.APPLICATION;

export async function bootstrap() {
    await initRedisIndex();
    await refreshRedisCache();
    cleanupTempFiles();
    startQueueWorker();
    await scheduleCleanupJob();
}

// Registers a BullMQ repeatable job that runs daily at 02:00 UTC.
// Stored in Redis — survives server restarts without re-registering duplicate schedules.
async function scheduleCleanupJob() {
  await bullQueue.add(
    QueueJobType.CLEANUP,
    { type: QueueJobType.CLEANUP, recordId: "cleanup", payload: {} },
    { repeat: { pattern: "0 2 * * *" }, jobId: "cleanup-daily" },
  );
  log.info("Cleanup job scheduled — runs daily at 02:00 UTC");
}

function startQueueWorker() {
  // Instantiate and start the BullMQ worker.
  // The processor function handles all job processing logic.
  // To add a new processor: add a file to Config/queue/processors/ and register it in processors/index.ts
  const worker = new BullWorker(processQueueJob);
  worker.start();
}

async function refreshRedisCache() {
    // TODO: warm up any Redis caches needed at startup
}

async function initRedisIndex() {
    // TODO: create RediSearch indexes for new features here
}
