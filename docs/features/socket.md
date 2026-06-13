# Socket.io — Real-time Events

Authenticated users can open a persistent WebSocket connection to receive real-time events (currently: generation job completion/failure). The connection is user-scoped — a user's event is emitted only to their socket(s), regardless of how many browser tabs they have open.

---

## Connection

**URL:** same host and port as the REST API (e.g. `http://localhost:9000`)

**Transport:** WebSocket (with polling fallback)

**Auth:** pass the JWT access token in the socket handshake `auth` object:

```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:9000", {
  auth: { token: accessToken },
});
```

If the token is missing or invalid the server rejects the handshake immediately (the client receives a `connect_error` event) — no socket is opened.

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

---

## Security notes

| Concern | How it is handled |
|---|---|
| Authentication | JWT access token in handshake — verified on every new connection |
| Authorisation | Events are emitted only to `user:<userId>` — a user can never receive another user's events |
| Token expiry | If the token expires, the client must reconnect with a fresh token. The server does **not** proactively close an already-open socket when a token expires. |
| CORS | Driven by `CORS_ALLOWED_ORIGINS`; if no origins are configured, all cross-origin connections are denied (fail-closed) |
| Emit failure | `emitToUser()` is fire-and-forget and swallows errors — a socket failure never affects REST response correctness |

---

## Demo frontend hook

The demo frontend exposes a ready-to-use React hook at `src/hooks/useGenerationSocket.ts`:

```ts
const { status, lastUpdate, clearLastUpdate } = useGenerationSocket(accessToken);

useEffect(() => {
  if (!lastUpdate) return;
  if (lastUpdate.status === "completed") {
    setVideoUrl(lastUpdate.outputUrl);
    clearLastUpdate();
  }
}, [lastUpdate]);
```

`status` values: `"disconnected"` | `"connecting"` | `"connected"` | `"error"`

---

## File structure

```
src/Config/socket/
  index.ts      ← initSocket(httpServer) + getIO() singleton
  middleware.ts ← JWT auth — rejects unauthenticated handshakes
  handler.ts    ← connection handler — joins user room, ping/pong, disconnect log
  events.ts     ← SocketEvent constants + TGenerationUpdatePayload type

demo-fe/src/
  lib/socket.ts          ← socket.io-client singleton + getSocket() / disconnectSocket()
  lib/socket.types.ts    ← TGenerationUpdatePayload type
  hooks/useGenerationSocket.ts ← React hook — connect/disconnect lifecycle + event listener
```
