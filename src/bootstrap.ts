import { cleanupTempFiles } from "@/Utils/file/upload";
import { BullWorker } from "@/Config/queue";
import { processQueueJob } from "@/Config/queue/processors";

export async function bootstrap() {
    await initRedisIndex();
    await refreshRedisCache();
    cleanupTempFiles();
    startQueueWorker();
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
