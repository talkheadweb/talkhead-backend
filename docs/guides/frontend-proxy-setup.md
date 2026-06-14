# Frontend API Proxy Setup (Next.js)

Explains the SameSite cookie model, why a proxy Route Handler is still needed even
with `SameSite=None`, and how everything fits together.

---

## SameSite — what it is and why it matters

`SameSite` is a browser cookie attribute that controls when the browser attaches a
cookie to an outgoing request. It has three values:

| Value | Browser sends the cookie when… | Typical use |
|---|---|---|
| `Strict` | Only same-site requests (navigation from the same domain only) | High-security apps |
| `Lax` | Same-site requests **+** top-level navigations (clicking a link). Cross-origin `fetch`/XHR/WebSocket — **no** | Default for most apps |
| `None` | Every request including cross-origin **fetch**, XHR, and WebSocket upgrades — **requires `Secure=true` (HTTPS)** | APIs with cross-origin browser clients |

> **"Same-site" vs "same-origin":** same-site means the registrable domain matches
> (`demo.talkhead.ai` and `dev-api.talkhead.ai` are same-site because both share
> `talkhead.ai`). Same-origin is stricter — scheme + host + port must all match.
> SameSite checks only the registrable domain.

---

## Cookie settings used in this project

```
AUTH_COOKIE_SAMESITE=none
AUTH_COOKIE_SECURE=true
```

**Why `None` and not `Lax`?**

The Socket.io client connects **directly from the browser** to `dev-api.talkhead.ai`
— not through the Next.js proxy. This is a cross-origin WebSocket upgrade request.
`SameSite=Lax` cookies are stripped by the browser on cross-origin connections.
`SameSite=None; Secure` tells the browser to attach the cookie regardless of origin.

HTTP API requests go through the Next.js proxy (same origin from the browser's
perspective), so `Lax` would work for those — but `None` is needed for Socket.io,
and using one setting for all cookies is simpler.

**Why `Secure=true`?**

`SameSite=None` is only valid when paired with `Secure=true`. Browsers reject and
discard `SameSite=None` cookies that lack the `Secure` flag. Both frontend and
backend are HTTPS in all deployed environments so this is always safe.

**Local development exception:**

`localhost` is exempt from `Secure` requirements in most browsers. The local `.env`
uses `SameSite=Lax` + `Secure=false` because the socket connects to
`http://localhost:9000` — same origin, so `Lax` is sufficient and `Secure` is
irrelevant.

```
# .env (local only — never deploy these values)
AUTH_COOKIE_SAMESITE=lax
AUTH_COOKIE_SECURE=false
```

---

## Why the Next.js proxy is still needed with `SameSite=None`

`SameSite=None` solves the *sending* of cookies from the browser to the backend.
It does **not** solve the *receiving* and storing of `Set-Cookie` response headers
in cross-origin contexts — that requires `Access-Control-Allow-Credentials: true` +
an exact `Access-Control-Allow-Origin` header on **every** response.

The critical case is **silent token refresh**: when the access token expires, the
`authenticate` middleware issues a new one via `Set-Cookie`. For the browser to
store that updated cookie, the response must carry correct CORS credentials headers.
The proxy makes the browser think it's talking to its own origin, eliminating the
CORS requirement entirely and making `Set-Cookie` storage reliable across all
environments.

Additional reasons to keep the proxy:

- **Hides the backend URL** — the browser never sees `dev-api.talkhead.ai` directly
- **Consistent code paths** — `apiRequest()` uses relative `/api/v1/...` paths in
  both dev and production; no conditional base URLs needed
- **Server-side rendering** — `getCurrentUser()` calls the backend directly from the
  Next.js server with manual cookie forwarding; it doesn't go through the proxy at all

```
                      HTTP requests (REST API)
────────────────────────────────────────────────────────
Browser                     Next.js server               Backend
  │                               │                         │
  │  fetch("/api/v1/auth/login")  │                         │
  │──────────────────────────────>│                         │
  │                               │  fetch(BACKEND_URL/...) │
  │                               │────────────────────────>│
  │                               │<── 200 + Set-Cookie ────│
  │<── 200 + Set-Cookie ──────────│  (all headers forwarded)│
  │  cookie stored ✓              │                         │

                      Socket.io (real-time)
────────────────────────────────────────────────────────
Browser                                              Backend
  │                                                     │
  │  WebSocket upgrade → dev-api.talkhead.ai            │
  │  Cookie: access_token=... (SameSite=None allows it) │
  │────────────────────────────────────────────────────>│
  │<── 101 Switching Protocols ─────────────────────────│
  │  socket open ✓                                      │
```

The proxy handles HTTP. `SameSite=None` handles Socket.io. Both are needed.

---

## Implementation

### `src/app/api/[...path]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const target = new URL(req.nextUrl.pathname + req.nextUrl.search, BACKEND_URL);

  const forwardHeaders = new Headers(req.headers);
  forwardHeaders.delete("host");

  const upstream = await fetch(target.toString(), {
    method : req.method,
    headers: forwardHeaders,
    body   : req.method !== "GET" && req.method !== "HEAD"
               ? await req.arrayBuffer()
               : undefined,
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    responseHeaders.append(key, value);
  });

  return new NextResponse(upstream.body, {
    status : upstream.status,
    headers: responseHeaders,
  });
}

export const GET     = proxy;
export const POST    = proxy;
export const PUT     = proxy;
export const PATCH   = proxy;
export const DELETE  = proxy;
export const OPTIONS = proxy;
export const HEAD    = proxy;
```

> **Why not `rewrites()` in `next.config.ts`?**
> Next.js `rewrites()` only rewrites the URL — it does **not** forward response headers.
> `Set-Cookie` from the backend is silently dropped. The Route Handler proxy forwards
> every header unchanged, including `Set-Cookie` from silent token refresh.

---

## API client pattern

All browser-side fetch calls use **relative paths** so they route through the proxy:

```ts
// ✅ correct — goes through the proxy
apiRequest("/auth/me");           // → /api/v1/auth/me → proxy → backend

// ❌ wrong — bypasses proxy, CORS headers needed, Set-Cookie may not be stored
fetch("https://dev-api.talkhead.ai/api/v1/auth/me", { credentials: "include" });
```

Socket.io is the one exception — it always connects to the backend directly:

```ts
const socket = io(process.env.NEXT_PUBLIC_API_URL, { withCredentials: true });
```

---

## Backend configuration

### CORS

`CORS_ALLOWED_ORIGINS` must include every frontend origin. This list also doubles
as the OAuth redirect whitelist:

```
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://demo.talkhead.ai
```

### Cookie settings (deployed)

```
AUTH_COOKIE_SAMESITE=none
AUTH_COOKIE_SECURE=true
```

### Cookie settings (local development)

```
AUTH_COOKIE_SAMESITE=lax
AUTH_COOKIE_SECURE=false
```

---

## Google OAuth

Google OAuth requires a full browser navigation (not a `fetch`) so the proxy is not
involved. The callback handler at `/auth/callback` exchanges the one-time code for
tokens via a server-side fetch and forwards `Set-Cookie` to the browser directly.
