import { cleanupTempFiles } from "@/Utils/file/upload";

export async function bootstrap() {
    await initRedisIndex();
    await refreshRedisCache();
    cleanupTempFiles(); // remove orphaned temp files older than 1 hour from previous runs
}

async function refreshRedisCache() {
    // TODO: warm up any Redis caches needed at startup
}

async function initRedisIndex() {
    // TODO: create RediSearch indexes for new features here
}
