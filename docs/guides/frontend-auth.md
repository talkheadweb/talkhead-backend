# Frontend Authentication Guide

How to handle session state, protected routes, and user identity on the frontend.

---

## How cookies work in this backend

On login the server sets **three cookies**:

| Cookie | `httpOnly` | JS readable | Purpose |
|--------|-----------|-------------|---------|
| `access_token` | ✅ Yes | ❌ No | Short-lived JWT (15 min) — sent automatically by browser on every API request |
| `refresh_token` | ✅ Yes | ❌ No | Long-lived JWT (7 days) — used by backend to silently issue new access tokens |
| `session_info` | ❌ No | ✅ Yes | JSON string with public user data — the only cookie your JS can read |

In development the names have a `_dev` suffix: `access_token_dev`, `refresh_token_dev`, `session_info_dev`.

The frontend **never** manages access tokens. The browser sends them automatically, the backend renews them silently. Your only job is reading `session_info`.

---

## `session_info` — what's in it

```json
{
  "uid":               "6700000000000000000000ab",
  "name":              "Jane Doe",
  "email":             "jane@example.com",
  "role":              "user",
  "profilePictureKey": "avatars/uuid.webp"
}
```

This cookie is set on every login (email/password and OAuth) and cleared on logout. It has the same 7-day lifetime as the refresh token.

> **Important:** `session_info` is for UI rendering only — never use it for access control decisions. All real authorization happens on the backend using the httpOnly tokens.

---

## Reading `session_info`

```ts
// utils/session.ts

export type SessionInfo = {
  uid              : string;
  name             : string;
  email            : string;
  role             : "user" | "admin";
  profilePictureKey: string | null;
};

const COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "session_info"
  : "session_info_dev";

export function getSessionInfo(): SessionInfo | null {
  if (typeof document === "undefined") return null; // SSR guard

  const match = document.cookie
    .split("; ")
    .find(row => row.startsWith(`${COOKIE_NAME}=`));

  if (!match) return null;

  try {
    return JSON.parse(decodeURIComponent(match.split("=").slice(1).join("=")));
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return getSessionInfo() !== null;
}
```

---

## Recommended pattern — call `/auth/me` once, cache the result

```
App loads
  ↓
Read session_info cookie (synchronous, no network)
  ↓
  ├── null → user is logged out → redirect to /login
  └── has value → user appears logged in
        ↓
        Call GET /api/v1/auth/me once (validates the real session)
          ↓
          ├── 200 → store full user in global state (Zustand / Context / Redux)
          │         render the app normally
          └── 401 → session expired or revoked
                    clear local state → redirect to /login
```

`/auth/me` is called **once on app initialisation**, not on every page navigation. After that, all route guards check your global state — no more network calls.

---

## Next.js example (App Router)

### Global provider (call `/auth/me` once)

```tsx
// app/providers/AuthProvider.tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSessionInfo, type SessionInfo } from "@/utils/session";

type AuthState = { user: SessionInfo | null; loading: boolean };

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fast synchronous check — no network
    if (!getSessionInfo()) {
      setLoading(false);
      return;
    }

    // Validate the actual session (one network call on app load)
    fetch("/api/proxy/auth/me", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => setUser(data?.data ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

```tsx
// app/layout.tsx
import { AuthProvider } from "@/providers/AuthProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

### Protected page (check state, not network)

```tsx
// app/dashboard/page.tsx
"use client";

import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading) return <div>Loading...</div>;
  if (!user)   return null; // redirect in progress

  return <div>Welcome, {user.name}</div>;
}
```

### Admin-only page

```tsx
export default function AdminPanel() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user)                router.replace("/login");
    if (!loading && user?.role !== "admin") router.replace("/403");
  }, [user, loading, router]);

  if (loading || !user) return null;

  return <div>Admin panel</div>;
}
```

---

## Handling 401 responses globally

Any API call can return 401 if the session expires mid-session (e.g. admin revoked the account). Add a global fetch interceptor:

```ts
// utils/api.ts
export async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...options });

  if (res.status === 401) {
    // Session gone — clear local state and redirect
    window.location.href = "/login";
    return res;
  }

  return res;
}
```

Use `apiFetch` everywhere instead of raw `fetch`. This way you never need to check for 401 in individual components.

---

## Logout

```ts
async function logout() {
  await fetch("/api/proxy/auth/logout", {
    method     : "POST",
    credentials: "include",
  });
  // Backend clears all three cookies (access_token, refresh_token, session_info)
  window.location.href = "/login";
}
```

After logout, `session_info` is gone. The next `isLoggedIn()` call returns `false`.

---

## Role-based UI rendering

Use `session_info` for showing/hiding UI elements. Use the backend for actual access control.

```tsx
const { user } = useAuth();

// Show admin link in nav — UI only, not security
{user?.role === "admin" && <NavLink href="/admin">Admin</NavLink>}
```

The backend enforces the real check — even if someone edits the cookie in DevTools, the API returns 403.

---

## What happens when the session expires

Understanding this prevents the "stuck logged-in UI" problem.

### Scenario 1 — Natural expiry (7 days, most common)

```
session_info maxAge  = 7 days   ← set by server
refresh_token maxAge = 7 days   ← same value

Both expire at exactly the same time in the browser.

User visits app after 7 days:
  → browser checks session_info → already gone (expired by browser)
  → isLoggedIn() returns null
  → AuthProvider skips /auth/me entirely
  → redirect to /login — zero network calls needed
```

They expire together because the server sets the same `maxAge` on both.
The frontend never even reaches the API in this case.

### Scenario 2 — Admin force-revokes session

This is when an admin suspends an account or manually deletes the session from Redis.

```
Admin revokes user session in backend
  → refresh token deleted from Redis
  → session_info cookie is STILL in browser (hasn't expired yet)

User visits app:
  → reads session_info → has value → appears logged in
  → AuthProvider calls /auth/me once
  → backend: access_token expired → tries refresh_token
           → token not in Redis (revoked) → 401
  → AuthProvider 401 handler fires → clear state → redirect to /login ✅
```

`session_info` being present here is intentional — it just signals "a session existed".
`/auth/me` is what confirms it is still active. This is why you always call `/auth/me`
on app load even when `session_info` exists.

### Scenario 3 — Explicit logout

```
User clicks logout
  → POST /auth/logout
  → backend calls clearCookie() on all three:
      access_token  → cleared
      refresh_token → cleared
      session_info  → cleared ✅
  → browser discards all three immediately

Next visit:
  → session_info gone → isLoggedIn() returns null → /login
```

### Session expiry — summary table

| Situation | `session_info` cleared? | What frontend sees |
|---|---|---|
| 7-day natural expiry | ✅ Yes — browser discards automatically | `isLoggedIn()` → null → straight to /login, no API call |
| Explicit logout | ✅ Yes — server clears it | Same as above |
| Admin force-revoke | ❌ Not immediately | Cookie exists → `/auth/me` returns 401 → global handler → /login |
| User clears browser cookies | ✅ Yes | `isLoggedIn()` → null → straight to /login |

**The rule:** `session_info` tells you a session *existed*. `/auth/me` on app load
confirms it *still works*. The global 401 handler catches any expiry that happens
mid-session. The frontend is never stuck — every path leads to /login when the session
is gone.

---

## Cookie name suffix

In development (`NODE_ENV=development`) the backend appends `_dev` to all cookie names:

| Environment | Cookie names |
|---|---|
| production | `access_token`, `refresh_token`, `session_info` |
| development | `access_token_dev`, `refresh_token_dev`, `session_info_dev` |

Your utility code must match this. Mirror the same logic:

```ts
const suffix      = process.env.NODE_ENV === "production" ? "" : "_dev";
const SESSION_INFO = `session_info${suffix}`;
```

Hardcoding `"session_info"` in dev will silently fail — the cookie exists under a
different name and `isLoggedIn()` will always return `null`.

---

## Summary

| Question | Answer |
|----------|--------|
| How do I know if a user is logged in? | Read `session_info` cookie — synchronous, no network |
| When do I call `/auth/me`? | Once on app load to validate and get full user data |
| Do I call `/auth/me` on every page? | No — cache in global state, check state on every navigation |
| What if the session expires mid-session? | Global 401 handler clears state and redirects to /login |
| What if session is force-revoked by admin? | Same — `/auth/me` returns 401, global handler fires |
| What if session expires naturally (7 days)? | `session_info` is already gone — redirect happens before any API call |
| Can I use `session_info` for access control? | No — UI only. Backend enforces real authorization |
| Do I manage access tokens? | No — browser sends them automatically, backend refreshes silently |
| What if I hardcode `"session_info"` in dev? | It silently fails — use the suffix logic, see Cookie name suffix section |
