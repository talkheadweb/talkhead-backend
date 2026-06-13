import type { Socket } from "socket.io";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { LogService } from "@/Config/logger/utils";

const log = LogService.AUTH;

/**
 * Validates the JWT access token from socket.handshake.auth.token.
 * Attaches uid / email / role to socket.data on success.
 * Rejects the connection immediately on any auth failure — no socket is opened.
 */
export const socketAuthMiddleware = (
  socket: Socket,
  next  : (err?: Error) => void,
): void => {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    log.warn("Socket connection rejected — no token", { id: socket.id });
    return next(new Error("Authentication required"));
  }

  try {
    const payload = JwtHelper.verifyAccessToken(token);
    socket.data.userId = payload.uid;
    socket.data.email  = payload.email;
    socket.data.role   = payload.role;
    next();
  } catch {
    log.warn("Socket connection rejected — invalid token", { id: socket.id });
    next(new Error("Invalid or expired token"));
  }
};
