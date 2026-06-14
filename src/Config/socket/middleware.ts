import type { Socket } from "socket.io";
import { parse as parseCookies } from "cookie";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/App/Auth/const";
import { resolveSocketSession } from "@/App/Auth/utils";
import { LogService } from "@/Config/logger/utils";

const log = LogService.AUTH;

/**
 * Socket.io auth middleware — reads cookies from the handshake HTTP headers.
 *
 * The handshake is a standard HTTP upgrade request so the browser sends all
 * cookies automatically. No token needs to be passed explicitly from the client.
 *
 * Delegates auth logic to resolveSocketSession() — a variant of resolveSession()
 * that skips the Redis revocation check (see docs/auth-flow.md §3b for why).
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
  const origin       = socket.handshake.headers.origin ?? "unknown";

  // Diagnose cross-origin cookie issues — if both tokens are absent the most
  // likely cause is SameSite=Lax cookies on a cross-origin socket connection.
  // Fix: set AUTH_COOKIE_SAMESITE=none + AUTH_COOKIE_SECURE=true in the env.
  log.debug("Socket handshake", {
    id             : socket.id,
    origin,
    hasAccessToken : !!accessToken,
    hasRefreshToken: !!refreshToken,
    transport      : socket.conn.transport.name,
  });

  if (!accessToken && !refreshToken) {
    log.warn("Socket handshake has no cookies — likely SameSite mismatch", {
      id: socket.id,
      origin,
      hint: "Set AUTH_COOKIE_SAMESITE=none and AUTH_COOKIE_SECURE=true for cross-origin sockets",
    });
  }

  try {
    const session = await resolveSocketSession(accessToken, refreshToken);

    socket.data.userId = session.uid;
    socket.data.email  = session.email;
    socket.data.role   = session.role;

    log.info("Socket authenticated", {
      id       : socket.id,
      uid      : session.uid,
      origin,
      refreshed: session.refreshed,
    });

    next();
  } catch (err: any) {
    log.warn("Socket rejected — auth failed", { id: socket.id, origin, reason: err?.message });
    next(new Error(err?.message ?? "Authentication required."));
  }
};
