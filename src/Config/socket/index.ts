import type { Server as HttpServer } from "http";
import { Server }                   from "socket.io";
import config                       from "@/Config";
import { LogService }               from "@/Config/logger/utils";
import { socketAuthMiddleware }     from "./middleware";
import { registerSocketHandlers }   from "./handler";

const log = LogService.APPLICATION;

let io: Server | null = null;

/**
 * Initialises the Socket.io server and attaches it to the existing HTTP server.
 * Must be called once in index.ts before server.listen().
 * CORS is driven by the same CORS_ALLOWED_ORIGINS env var used by Express.
 */
export const initSocket = (httpServer: HttpServer): Server => {
  const allowedOrigins = config.cors.allowed_origins.length
    ? config.cors.allowed_origins
    : false; // false = deny all cross-origin WS connections

  io = new Server(httpServer, {
    cors: {
      origin     : allowedOrigins,
      credentials: true,
    },
    // Clients must authenticate within 10 s or the connection is dropped
    connectTimeout: 10_000,
  });

  io.use(socketAuthMiddleware);
  registerSocketHandlers(io);

  log.info("Socket.io server initialised");
  return io;
};

/**
 * Returns the Socket.io server singleton.
 * Throws if called before initSocket() — guards against import-order bugs.
 */
export const getIO = (): Server => {
  if (!io) throw new Error("Socket.io server not initialised — call initSocket() first");
  return io;
};
