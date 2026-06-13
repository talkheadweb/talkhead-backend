import type { Server, Socket } from "socket.io";
import { LogService } from "@/Config/logger/utils";
import { SocketEvent } from "./events";

const log = LogService.APPLICATION;

const onConnection = (socket: Socket): void => {
  const userId = socket.data.userId as string;

  // Each user gets their own room — all their tabs share it.
  // Emit to `user:<userId>` to reach every active tab for that user.
  socket.join(`user:${userId}`);
  log.info("Socket connected", { socketId: socket.id, userId });

  // Health-check handshake — client sends "ping", server replies "pong"
  socket.on(SocketEvent.PING, () => {
    socket.emit(SocketEvent.PONG);
  });

  socket.on("disconnect", (reason) => {
    log.info("Socket disconnected", { socketId: socket.id, userId, reason });
  });
};

export const registerSocketHandlers = (io: Server): void => {
  io.on("connection", onConnection);
};
