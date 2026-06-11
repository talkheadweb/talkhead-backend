# Frontend API Proxy Setup (Next.js)

Explains why browser cookies fail when the frontend runs locally against a deployed
backend, and how to fix it with a Next.js Route Handler proxy.

---

## Why cookies break in local development

| Environment | Frontend | Backend | Cookie behaviour |
|---|---|---|---|
| Local dev | `http://localhost:3000` | `https://dev-api.talkhead.ai` | ❌ Cross-origin — cookies blocked |
| Production | `https://demo.talkhead.ai` | `https://dev-api.talkhead.ai` | ✅ Same-site cookies work |

The backend sets cookies with `HttpOnly; SameSite=Lax`. Browsers refuse to send
`SameSite=Lax` cookies on cross-origin `fetch` requests from JavaScript.

`SameSite=None; Secure=true` would allow cross-origin cookies but requires HTTPS on
both sides — localhost is always plain HTTP.

**Postman is unaffected** because it bypasses all browser cookie security rules.

---

## The fix — Next.js Route Handler proxy

A catch-all Route Handler at `src/app/api/[...path]/route.ts` forwards every
`/api/*` request to the backend and streams the full response — including `Set-Cookie`
headers — back to the browser. The browser sees everything as the same origin
(localhost or the live domain), so cookies are stored and sent correctly.

```
Browser                     Next.js server                   Backend
  │                               │                              │
  │  fetch("/api/v1/auth/login")  │                              │
  │──────────────────────────────>│                              │
  │                               │  fetch(BACKEND_URL + path)  │
  │                               │─────────────────────────────>│
  │                               │<── 200 + Set-Cookie ─────────│
  │<── 200 + Set-Cookie ──────────│   (all headers forwarded)    │
  │  (cookie stored for localhost)│                              │
  │                               │                              │
  │  fetch("/api/v1/auth/me")     │                              │
  │  Cookie: access_token=...     │                              │
  │──────────────────────────────>│                              │
  │                               │  forwards Cookie header      │
  │                               │─────────────────────────────>│
```

> **Why not `rewrites()` in `next.config.ts`?**
> Next.js `rewrites()` only rewrites the URL. It does **not** forward response headers
> from the upstream backend. So when the `authenticate` middleware silently refreshes
> an access token and calls `res.cookie()`, that `Set-Cookie` header is silently
> dropped and the browser never updates the cookie. The Route Handler proxy avoids
> this entirely by forwarding every header unchanged.

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

### `next.config.ts`

No `rewrites()` needed — the Route Handler takes priority over rewrites for `/api/*`.

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No rewrites() — /api/[...path]/route.ts is the proxy
};

export default nextConfig;
```

### `.env` / `.env.local`

```
NEXT_PUBLIC_API_URL=https://dev-api.talkhead.ai
```

This is the only variable needed. The proxy handler appends incoming paths to it.

---

## API client pattern

All browser-side fetch calls must use **relative paths** so they go through the proxy:

```ts
// src/lib/api.ts

const BASE = "/api/v1";

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    ...options,
    credentials: "include",   // required — sends cookies with every request
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }

  return res.json();
}
```

| ❌ Do not | ✅ Do |
|---|---|
| `fetch("https://dev-api.talkhead.ai/api/v1/...")` | `fetch("/api/v1/...")` |
| Omit `credentials` | Always `credentials: "include"` |
| Use `next.config.ts` rewrites | Use the Route Handler proxy |

> **Server-side calls are different.** `getCurrentUser()` and other server-component
> fetches run on the Next.js server, not in a browser. They call the backend directly
> using the absolute `NEXT_PUBLIC_API_URL` and manually forward cookies from the
> incoming Next.js request. They do **not** go through the proxy route handler.

---

## Google OAuth — dynamic origin

Google OAuth requires a full browser navigation to the backend (not a `fetch`), so
the proxy is not involved. The Google auth link passes the current `window.location.origin`
to the backend:

```ts
const GOOGLE_AUTH_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/social/google`;

// In the login form (client component):
href={`${GOOGLE_AUTH_BASE}?origin=${window.location.origin}`}
```

The backend validates this origin against `CORS_ALLOWED_ORIGINS` and uses it to
redirect back to the correct frontend after OAuth completes. This means the same
deployed backend works for `http://localhost:3000` in development and
`https://demo.talkhead.ai` in production without any configuration change.

After OAuth, the backend redirects to `<origin>/auth/callback?code=<uuid>`. The
`/auth/callback` route handler exchanges the code for tokens via a server-side fetch
and forwards the `Set-Cookie` headers to the browser — same forwarding pattern as
the API proxy.

The `/auth/callback` route handler detects the correct public domain automatically
from reverse-proxy headers (`x-forwarded-host`, `x-forwarded-proto`), so redirects
always go to the real domain rather than `localhost`:

```ts
function getOrigin(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host  = request.headers.get("x-forwarded-host")  ?? request.headers.get("host") ?? request.nextUrl.host;
  return `${proto}://${host}`;
}
```

---

## Backend configuration

### CORS — required origins

`CORS_ALLOWED_ORIGINS` on the backend must include every frontend origin:

```
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://demo.talkhead.ai
```

This list doubles as the **OAuth redirect whitelist** — only origins in this list
are accepted as `?origin=` values when starting a Google OAuth flow.

### Cookie settings

The backend defaults work correctly with the proxy in place. No `AUTH_COOKIE_SAMESITE`
or `AUTH_COOKIE_SECURE` overrides are needed:

```
# Do NOT set these in production — let the backend use its defaults
# AUTH_COOKIE_SAMESITE=lax
# AUTH_COOKIE_SECURE=false
```

### Social callback URL

`FRONTEND_SOCIAL_CALLBACK_URL` is the **fallback** used when a frontend doesn't pass
`?origin=`. Set it to your primary production frontend:

```
FRONTEND_SOCIAL_CALLBACK_URL=https://demo.talkhead.ai/auth/callback
```

---

## Production behaviour

The same proxy route handler runs in production. When both frontend and backend are
on HTTPS, cookies already work cross-origin with `SameSite=Lax`, so the proxy is
technically redundant — but keeping it active means identical code paths in dev
and production and no risk of a `Set-Cookie` header being dropped anywhere.
