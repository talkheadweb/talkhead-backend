/*
  Application entry point.
  Startup order: MongoDB → Redis bootstrap → HTTP server listen
  Shutdown order: stop accepting → close connections → disconnect DB/Redis → exit
*/

import app from "@/app";
import config from "@/Config";
import connectDB from "@/Config/db";
import { RedisClient } from "@/Config/redis/connection";
import { RedisEventClient } from "@/Config/redis/events";
import { bootstrap } from "@/bootstrap";
import http from "http";
import mongoose from "mongoose";
import { LogService } from "./Config/logger/utils";

// Side-effect imports — connect Redis clients on startup
import "@/Config/redis/connection";
import "@/Config/redis/events";

const server = http.createServer(app);
const log    = LogService.APPLICATION;
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
 * Closes the HTTP server, then disconnects DB and Redis before exiting.
 * `server.closeAllConnections()` drops keep-alive connections immediately so
 * we don't wait for idle clients to time out (Node 18.2+).
 */
const shutdown = async (signal: string, exitCode: number) => {
  log.warn(`${signal} received — starting graceful shutdown`);

  // 1. Stop accepting new HTTP requests; kill idle keep-alive connections.
  server.closeAllConnections();
  server.close();

  // 2. Disconnect data stores so their connection pools release cleanly.
  try {
    await Promise.allSettled([
      mongoose.disconnect(),
      RedisClient.quit(),
      RedisEventClient.quit(),
    ]);
    log.info("DB and Redis disconnected.");
  } catch {
    // allSettled never rejects, but keep the catch for safety
  }

  log.info("Graceful shutdown complete.");
  process.exit(exitCode);
};

// Hard-exit fallback: if graceful shutdown takes more than 10 s, force quit.
const hardExit = (code: number) =>
  setTimeout(() => {
    log.error("Graceful shutdown timed out — forcing exit");
    process.exit(code);
  }, 10_000).unref(); // .unref() so this timer never prevents exit on its own

process.on("SIGTERM", () => { hardExit(0); shutdown("SIGTERM", 0); });
process.on("SIGINT",  () => { hardExit(0); shutdown("SIGINT",  0); });

process.on("uncaughtException", (err) => {
  log.error("uncaughtException →", err);
  hardExit(1);
  shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  // Log and continue — do not crash on unhandled promise rejections in production.
  // Promote to uncaughtException if you want crash-on-rejection behavior.
  log.error("unhandledRejection →", reason as any);
});
