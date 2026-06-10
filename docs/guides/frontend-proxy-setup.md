# Frontend API Proxy Setup (Next.js)

Explains why browser cookies fail when the frontend runs locally against a deployed backend, and how to fix it with a Next.js rewrite proxy.

---

## Why cookies break in local development

| Environment | Frontend | Backend | Cookie behaviour |
|---|---|---|---|
| Local dev | `http://localhost:3000` | `https://dev-api.talkhead.ai` | ❌ Cross-origin — cookies blocked |
| Production | `https://talkhead.ai` | `https://api.talkhead.ai` | ✅ Same-site cookies work |

The backend sets cookies with `SameSite=None; Secure=true` (required for cross-origin cookies in production). Browsers refuse to store `Secure` cookies on pages served over plain `http://`, and `localhost` is always plain HTTP.

`SameSite=Lax` does not fix this — it only sends cookies on top-level navigations (link clicks), not on `fetch`/XHR requests from JavaScript.

**Postman is unaffected** because it bypasses all browser cookie security rules.

---

## The fix — Next.js rewrite proxy

Configure Next.js to proxy `/api/*` requests through itself. The browser sees everything as `localhost:3000`, so there is no cross-origin restriction and cookies flow normally.

```
Browser                     Next.js (localhost:3000)          Backend (dev-api.talkhead.ai)
  │                                   │                                  │
  │  fetch("/api/v1/auth/login")      │                                  │
  │──────────────────────────────────>│                                  │
  │                                   │  rewrites to:                    │
  │                                   │  /api/v1/auth/login ────────────>│
  │                                   │                                  │
  │                                   │<──── Set-Cookie: token=... ──────│
  │<── Set-Cookie: token=... (same origin, accepted) ──────────────────  │
  │                                   │                                  │
  │  fetch("/api/v1/generations")     │                                  │
  │  (cookie sent automatically)      │                                  │
  │──────────────────────────────────>│                                  │
```

---

## Setup

### 1. next.config.ts

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

### 2. Environment files

**.env.local** (local dev — not committed to git)
```
NEXT_PUBLIC_API_URL=https://dev-api.talkhead.ai
```

**.env.production** (deployed frontend)
```
NEXT_PUBLIC_API_URL=https://api.talkhead.ai
```

`NEXT_PUBLIC_API_URL` is read at build time by the rewrite rule on the server side. The variable does not need to be referenced in browser-side code.

### 3. API client

Create a shared fetch wrapper so `credentials: "include"` and the relative base URL are never forgotten.

```ts
// lib/api.ts

const BASE = "/api/v1";

export async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",          // always — required for cookies
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.message ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// Feature-specific helpers
export const authApi = {
  login:    (body: object) => apiClient("/auth/login",    { method: "POST", body: JSON.stringify(body) }),
  register: (body: object) => apiClient("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  logout:   ()             => apiClient("/auth/logout",   { method: "POST" }),
  me:       ()             => apiClient("/auth/me"),
};

export const generationApi = {
  create: (body: object) => apiClient("/generations",              { method: "POST", body: JSON.stringify(body) }),
  list:   (params = "")  => apiClient(`/generations${params}`),
  getOne: (id: string)   => apiClient(`/generations/${id}`),
  cancel: (id: string)   => apiClient(`/generations/${id}/cancel`, { method: "PATCH" }),
  remove: (id: string)   => apiClient(`/generations/${id}`,        { method: "DELETE" }),
};
```

All URLs are relative (`/api/v1/...`). Never hardcode the backend domain in browser-side fetch calls.

---

## Backend configuration

### Remove the temporary cookie overrides

These env vars on the deployed dev API are no longer needed and should be removed:

```
# Remove these lines from the backend .env
AUTH_COOKIE_SAMESITE=lax
AUTH_COOKIE_SECURE=false
```

The backend defaults (`SameSite=None; Secure=true`) are correct for production and work fine with the proxy in local dev.

### CORS — allow localhost

`http://localhost:3000` must be in the backend `CORS_ALLOWED_ORIGINS` env var for preflight requests to succeed:

```
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://talkhead.ai
```

---

## Rule — all API calls use this pattern

This applies to **every** endpoint, not just auth. Any route that reads `req.user` requires the cookie to be present. Using a mix of relative and absolute URLs will cause intermittent auth failures.

| ❌ Do not | ✅ Do |
|---|---|
| `fetch("https://dev-api.talkhead.ai/api/v1/...")` | `fetch("/api/v1/...")` |
| Omit `credentials` | Always include `credentials: "include"` |
| Set `AUTH_COOKIE_SAMESITE=lax` on BE | Use the proxy — no BE config needed |

---

## How it behaves in production

When the frontend is deployed (HTTPS), rewrites are still active but they become optional — the frontend and backend are on different subdomains (`talkhead.ai` vs `api.talkhead.ai`), which is cross-site, so `SameSite=None; Secure=true` cookies work natively.

The rewrite proxy causes no harm in production and keeps the fetch call patterns identical across environments.
