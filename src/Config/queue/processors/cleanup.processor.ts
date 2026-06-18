import { Job } from "bullmq";
import { LogService } from "@/Config/logger/utils";
import { cleanupGenerations, cleanupCustomAvatars } from "@/Config/cleanup";
import type { TQueueJobData } from "../types";

const log = LogService.APPLICATION;

export const handleCleanupJob = async (_job: Job<TQueueJobData>): Promise<void> => {
  log.info("Cleanup job started");

  const [genCount, avatarCount] = await Promise.all([
    cleanupGenerations(),
    cleanupCustomAvatars(),
  ]);

  log.info("Cleanup job completed", {
    generationsDeleted  : genCount,
    customAvatarsDeleted: avatarCount,
  });
};
