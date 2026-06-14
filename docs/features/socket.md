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
`dev-api.talkhead.ai`). For the browser to attach cookies on a cross-origin WebSocket
upgrade, the cookies must be set with `SameSite=None; Secure`.

```
# Required on the backend for deployed environments
AUTH_COOKIE_SAMESITE=none
AUTH_COOKIE_SECURE=true
```

| Cookie setting | HTTP (proxied) | Socket.io (direct cross-origin) |
|---|---|---|
| `SameSite=Lax` | ✅ Works (proxy is same-origin) | ❌ Cookies stripped |
| `SameSite=None; Secure` | ✅ Works | ✅ Works |

Local development (`localhost:9000`) is same-origin for socket.io, so `SameSite=Lax`
works there and no change is needed locally.

### Auth resolution order (server-side)

1. `access_token` cookie — valid → accept
2. `access_token` expired → fall back to `refresh_token` cookie → verify + Redis revocation check → accept
3. No valid token in any cookie → reject with `"Authentication required."` (client receives `connect_error`)

> Note: the server does **not** issue a new cookie during the socket handshake (that happens on the next HTTP request). A silently-refreshed socket simply continues with the refresh-token identity until a new access token is issued.

> **Debugging:** if the backend logs `"Socket handshake has no cookies — likely SameSite mismatch"`, the fix is to set `AUTH_COOKIE_SAMESITE=none` and `AUTH_COOKIE_SECURE=true` in the deployed environment.

---

## Rooms

On connection the server automatically joins the socket to the room `user:<userId>`. All tabs for the same user share this room. You never need to join a room manually from the client.

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

## Demo frontend hook

The demo frontend exposes a ready-to-use React hook at `src/hooks/useGenerationSocket.ts`:

```ts
const { status, lastUpdate, clearLastUpdate } = useGenerationSocket(isLoggedIn);

useEffect(() => {
  if (!lastUpdate) return;
  if (lastUpdate.status === "completed") {
    setVideoUrl(lastUpdate.outputUrl);
    clearLastUpdate();
  }
}, [lastUpdate]);
```

`status` values: `"disconnected"` | `"connecting"` | `"connected"` | `"error"`

Cookies are sent automatically — no token argument is needed.

---

## File structure

```
src/Config/socket/
  index.ts      ← initSocket(httpServer) + getIO() singleton
  middleware.ts ← Cookie-based auth — resolves access_token / refresh_token from handshake headers
  handler.ts    ← connection handler — joins user room, ping/pong, disconnect log
  events.ts     ← SocketEvent constants + TGenerationUpdatePayload type

demo-fe/src/
  lib/socket.ts          ← SocketEvent constants
  lib/socket.types.ts    ← TGenerationUpdatePayload type
  hooks/useGenerationSocket.ts ← React hook — connect/disconnect lifecycle + event listener
```
