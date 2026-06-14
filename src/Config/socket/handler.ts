import type { Server, Socket } from "socket.io";
import { LogService } from "@/Config/logger/utils";
import { SocketEvent } from "./events";

const log = LogService.APPLICATION;

const onConnection = async (io: Server, socket: Socket): Promise<void> => {
  const userId = socket.data.userId as string;
  const room   = `user:${userId}`;

  // Enforce single connection per user — disconnect any existing socket(s)
  // for this user before joining the room with the new one.
  const existing = await io.in(room).fetchSockets();
  for (const old of existing) {
    if (old.id !== socket.id) {
      log.info("Socket — evicting old connection for user", { old: old.id, new: socket.id, userId });
      old.disconnect(true);
    }
  }

  socket.join(room);
  log.info("Socket connected", { socketId: socket.id, userId });

  socket.on(SocketEvent.PING, () => {
    socket.emit(SocketEvent.PONG);
  });

  socket.on("disconnect", (reason) => {
    log.info("Socket disconnected", { socketId: socket.id, userId, reason });
  });
};

export const registerSocketHandlers = (io: Server): void => {
  io.on("connection", (socket) => void onConnection(io, socket));
};
