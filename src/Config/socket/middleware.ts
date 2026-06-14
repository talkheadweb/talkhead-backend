import type { Socket } from "socket.io";
import { parse as parseCookies } from "cookie";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/App/Auth/const";
import { resolveSession } from "@/App/Auth/utils";
import { LogService } from "@/Config/logger/utils";

const log = LogService.AUTH;

/**
 * Socket.io auth middleware — reads cookies from the handshake HTTP headers.
 *
 * The handshake is a standard HTTP upgrade request so the browser sends all
 * cookies automatically. No token needs to be passed explicitly from the client.
 *
 * Delegates auth logic to resolveSession() — the same utility used by the HTTP
 * authenticate middleware — so both transports share one token resolution path.
 *
 * Note: no new cookie is issued here (WebSocket has no Set-Cookie). The next
 * HTTP request will trigger a silent refresh if the access token has expired.
 */
export const socketAuthMiddleware = async (
  socket: Socket,
  next  : (err?: Error) => void,
): Promise<void> => {
  const rawCookieHeader = socket.handshake.headers.cookie ?? "";
  const cookies         = parseCookies(rawCookieHeader);

  const accessToken  = cookies[ACCESS_COOKIE_NAME];
  const refreshToken = cookies[REFRESH_COOKIE_NAME];

  try {
    const session = await resolveSession(accessToken, refreshToken);

    socket.data.userId = session.uid;
    socket.data.email  = session.email;
    socket.data.role   = session.role;

    if (session.refreshed) {
      log.info("Socket authenticated via refresh token", { id: socket.id, uid: session.uid });
    }

    next();
  } catch (err: any) {
    log.warn("Socket rejected — auth failed", { id: socket.id, reason: err?.message });
    next(new Error(err?.message ?? "Authentication required."));
  }
};
