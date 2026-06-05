/*
  Application entry point.
  Startup order: MongoDB → bootstrap → HTTP server listen
  Shutdown order: stop accepting → close connections → disconnect DB/Redis → exit
*/

import app from "@/app";
import { bootstrap } from "@/bootstrap";
import config from "@/Config";
import connectDB from "@/Config/db";
import { RedisClient } from "@/Config/redis/connection";
import { RedisEventClient } from "@/Config/redis/events";
import http from "http";
import mongoose from "mongoose";
import { LogService } from "./Config/logger/utils";

// Side-effect imports — connect Redis clients on startup
import "@/Config/redis/connection";
import "@/Config/redis/events";

const server = http.createServer(app);
const log = LogService.APPLICATION;
const { port } = config;

const main = async () => {
  try {
    await connectDB();
    await bootstrap();
    server.listen(port, () => {
      log.info(`Server listening on port ${port}  →  http://localhost:${port}`);
    });
  } catch (e) {
    log.error("Startup failed", e as any);
    process.exit(1);
  }
};

main();

// ── Graceful shutdown ──────────────────────────────────────────────────────
/**
 * Closes the HTTP server, disconnects DB and Redis, then exits.
 * A hard-exit timer is started immediately as a fallback — if cleanup takes
 * longer than 10 s (e.g. a hung DB query), the process is force-killed.
 */
const shutdown = async (signal: string, exitCode: number): Promise<void> => {
  log.warn(`${signal} received — starting graceful shutdown`);

  // Start the hard-exit fallback before any async work begins.
  // .unref() so the timer never prevents exit on its own if cleanup finishes.
  setTimeout(() => {
    log.error("Graceful shutdown timed out — forcing exit");
    process.exit(exitCode);
  }, 10_000).unref();

  // Stop accepting new HTTP requests; drop idle keep-alive connections.
  server.closeAllConnections();
  server.close();

  // Disconnect data stores so their connection pools release cleanly.
  await Promise.allSettled([
    mongoose.disconnect(),
    RedisClient.quit(),
    RedisEventClient.quit(),
  ]);

  log.info("Graceful shutdown complete.");
  process.exit(exitCode);
};

process.on("SIGTERM", () => shutdown("SIGTERM", 0));
process.on("SIGINT", () => shutdown("SIGINT", 0));

process.on("uncaughtException", (err) => {
  log.error("uncaughtException →", err);
  shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection →", reason as any);
});
