# Socket.io — Real-time Events

Authenticated users can open a persistent WebSocket connection to receive real-time events (currently: generation job completion/failure). The connection is user-scoped — a user's event is emitted only to their socket(s), regardless of how many browser tabs they have open.

---

## Connection

**URL:** same host and port as the REST API (e.g. `http://localhost:9000`)

**Transport:** WebSocket (with polling fallback)

**Auth:** cookies — the browser sends the `access_token` and `refresh_token` httpOnly cookies automatically on the WebSocket handshake (the upgrade is a standard HTTP request). **No client-side token passing is required.**

```ts
import { io } from "socket.io-client";

const socket = io("https://dev-api.talkhead.ai", {
  withCredentials: true,   // required — tells the browser to include cookies on this cross-origin connection
});
```

### Cookie requirement for cross-origin sockets

The socket client connects **directly from the browser** to the backend — it does not
go through the Next.js proxy. This is a cross-origin connection (`demo.talkhead.ai` →
`dev-api.talkhead.ai`). Two cookie attributes are required for the browser to include
cookies on this direct connection:

```
# Required on the backend for deployed subdomain environments
AUTH_COOKIE_SAMESITE=none
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_DOMAIN=.talkhead.ai
```

**Why all three are needed:**

| Attribute | What it controls | Without it |
|---|---|---|
| `SameSite=None` | Allows cookies to be sent on cross-origin requests | Browser strips cookies from socket handshake |
| `Secure=true` | Required by browsers when `SameSite=None` | Browser silently discards the cookie |
| `Domain=.talkhead.ai` | Shares cookie across all `*.talkhead.ai` subdomains | Cookie stored under `demo.talkhead.ai` (via proxy) is never sent to `dev-api.talkhead.ai` (direct socket) |

The domain issue is the subtle one: HTTP requests go through the Next.js proxy, so the
browser stores cookies under `demo.talkhead.ai`. Without `Domain=.talkhead.ai`, those
cookies are invisible to `dev-api.talkhead.ai`.

| Setup | HTTP (proxied) | Socket.io (direct) |
|---|---|---|
| `SameSite=Lax`, no domain | ✅ Works | ❌ Stripped (SameSite) |
| `SameSite=None; Secure`, no domain | ✅ Works | ❌ Domain mismatch |
| `SameSite=None; Secure; Domain=.talkhead.ai` | ✅ Works | ✅ Works |

Local development (`localhost:9000`) is same-origin for socket.io, so `SameSite=Lax`
works and no domain override is needed locally.

### Auth resolution order (server-side)

1. `access_token` cookie — valid → accept
2. `access_token` expired → fall back to `refresh_token` cookie → verify + Redis revocation check → accept
3. No valid token in any cookie → reject with `"Authentication required."` (client receives `connect_error`)

> Note: the server does **not** issue a new cookie during the socket handshake (that happens on the next HTTP request). A silently-refreshed socket simply continues with the refresh-token identity until a new access token is issued.

> **Debugging:** if the backend logs `"Socket handshake has no cookies — likely SameSite mismatch"`, set `AUTH_COOKIE_SAMESITE=none`, `AUTH_COOKIE_SECURE=true`, and `AUTH_COOKIE_DOMAIN=.talkhead.ai` in the deployed environment, then log out and log back in to issue new cookies with the correct attributes.

---

## Rooms

On connection the server automatically joins the socket to the room `user:<userId>`. You never need to join a room manually from the client.

---

## Single connection per user

The server enforces **one active socket connection per user**. When a new socket connects, the handler checks the `user:<userId>` room for any existing socket(s) and calls `disconnect(true)` on them before the new socket joins.

**Effect on the client:**
- Page refresh → old socket is evicted server-side; new socket takes over seamlessly.
- Multiple tabs → the most recently connected tab becomes the active socket; all previous tabs receive a `disconnect` event with reason `"server namespace disconnect"`.
- The frontend `SocketProvider` handles reconnection automatically, so tabs that were evicted will attempt to reconnect — at which point they become the active connection until the next connect.

---

## Health check — ping / pong

Send `ping`, receive `pong`:

```ts
socket.emit("ping");
socket.on("pong", () => console.log("alive"));
```

Recommended: send a ping every ~25 s to keep the connection alive behind proxies and load balancers that close idle WebSocket connections.

---

## Events

### `generation:update`

Emitted when a generation job finishes (success **or** failure). The presigned output URL is included in the payload so the frontend can display the result immediately without a follow-up REST call.

**Payload:**

| Field | Type | Present when |
|---|---|---|
| `generationId` | `string` | always |
| `status` | `"completed" \| "failed"` | always |
| `outputFileKey` | `string` | `status === "completed"` and file was uploaded |
| `outputUrl` | `string` | `status === "completed"` and file was uploaded — presigned URL, ~1 h TTL |
| `errorMessage` | `string` | `status === "failed"` |

**Success example:**

```json
{
  "generationId" : "664f1b2c3e4a5b6c7d8e9f00",
  "status"       : "completed",
  "outputFileKey": "generations/output/550e8400-e29b-41d4-a716-446655440000.mp4",
  "outputUrl"    : "https://r2.example.com/generations/output/...?X-Amz-Signature=..."
}
```

**Failure example:**

```json
{
  "generationId": "664f1b2c3e4a5b6c7d8e9f00",
  "status"      : "failed",
  "errorMessage": "GPU out of memory"
}
```

**Client-side listener:**

```ts
socket.on("generation:update", (payload) => {
  if (payload.status === "completed") {
    setVideoUrl(payload.outputUrl);
  } else {
    setError(payload.errorMessage);
  }
});
```

---

## CORS

The socket server uses the same `CORS_ALLOWED_ORIGINS` env var as the REST API. Add your frontend origin there — no separate config needed.

```
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://app.yourdomain.com
```

Ensure `credentials: true` is set in the Socket.io CORS config (already done in `src/Config/socket/index.ts`) so cookies are accepted on cross-origin connections.

---

## Security notes

| Concern | How it is handled |
|---|---|
| Authentication | Cookies verified on every new connection; falls back to refresh token |
| Authorisation | Events emitted only to `user:<userId>` — a user can never receive another user's events |
| Token expiry | Access token expiry is handled at connect time via the refresh token fallback. Already-open sockets are not proactively closed on expiry. |
| CORS | Driven by `CORS_ALLOWED_ORIGINS`; if no origins are configured, all cross-origin connections are denied (fail-closed) |
| Emit failure | `emitToUser()` is fire-and-forget and swallows errors — a socket failure never affects REST response correctness |

---

## Demo frontend

The socket is initialised **once at the app root** via `SocketProvider` (`demo-fe/src/context/socket-context.tsx`), which wraps the entire layout. The connection persists across page navigations — it is not scoped to a single page.

**In components**, read socket state via `useSocketContext()`:

```ts
import { useSocketContext } from "@/context/socket-context";

const { status, lastUpdate, clearLastUpdate } = useSocketContext();

useEffect(() => {
  if (!lastUpdate) return;
  if (lastUpdate.status === "completed") {
    setVideoUrl(lastUpdate.outputUrl);
    clearLastUpdate();
  }
}, [lastUpdate, clearLastUpdate]);
```

`status` values: `"disconnected"` | `"connecting"` | `"connected"` | `"error"`

The underlying hook (`useGenerationSocket`) lives at `src/hooks/useGenerationSocket.ts` — it is used exclusively by `SocketProvider`. Do not call it directly from components.

---

## File structure

```
src/Config/socket/
  index.ts      ← initSocket(httpServer) + getIO() singleton
  middleware.ts ← Cookie-based auth — resolves access_token / refresh_token from handshake headers
  handler.ts    ← connection handler — single-connection enforcement, user room join, ping/pong
  events.ts     ← SocketEvent constants + TGenerationUpdatePayload type

demo-fe/src/
  context/socket-context.tsx  ← SocketProvider (app root) + useSocketContext() hook
  lib/socket.ts               ← SocketEvent constants
  lib/socket.types.ts             ← TGenerationUpdatePayload type
  hooks/useGenerationSocket.ts    ← internal hook used by SocketProvider only
```
