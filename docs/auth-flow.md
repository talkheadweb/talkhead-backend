# Authentication flow

Two authentication methods are supported. They produce the exact same token
format and the same end state — the client cannot distinguish which was used.

---

## Tokens

| Token | Where | Lifetime | Purpose |
|---|---|---|---|
| **Access token** | `httpOnly` cookie (`access_token[suffix]`) + JSON body | 15 min | Bearer token for API requests |
| **Refresh token** | `httpOnly` cookie (`refresh_token[suffix]`) | 7 days | Silent access token renewal |

Both tokens are set as `httpOnly` cookies so the browser sends them automatically — **zero frontend token management required** for web clients. The access token is also returned in the JSON body for mobile / API clients that can't read cookies.

**Cookie name suffix:** in development (`NODE_ENV=development`) the cookie names are automatically `access_token_dev` and `refresh_token_dev`. In production they are the plain `access_token` and `refresh_token`. This isolates sessions when dev and prod share the same root domain (e.g. `dev-api.talkhead.ai` and `api.talkhead.ai`) — no extra configuration needed.

The refresh token is stored in Redis on login and deleted on logout/password-change/reset, enabling instant revocation even before the JWT itself expires.

---

## Redis key reference

| Key pattern | TTL | Purpose |
|---|---|---|
| `auth:refresh:<userId>` | 7 days | Refresh token — deleted on logout/password change |
| `auth:verify:<userId>` | 24 hours | Email verification token (single-use) |
| `auth:reset:<userId>` | 1 hour | Password reset token (single-use) |
| `auth:social-code:<uuid>` | 2 minutes | One-time OAuth claim code (single-use) |
| `auth:presigned:<fileKey>` | 10 minutes | Cached R2 presigned URL for profile pictures |

---

## 1. Email / password flow

### Register

```
POST /api/v1/auth/register
{ name, email, password }
       │
       ▼
Zod validates body
       │
       ▼
Check email is unique (409 if duplicate)
       │
       ▼
Hash password (bcrypt, 12 rounds)
       │
       ▼
Create User (role = USER by default — never trust client role input)
       │
       ▼
Generate 24h verify token → store in Redis → send verification email
       │
       ▼
201 Created  ("Please check your email to verify your account.")
```

### Login

```
POST /api/v1/auth/login
{ email, password }
       │
       ▼
Find user by email (including password field — excluded by default)
       │
  user not found ──► 401 "Invalid email or password."
       │
  password wrong ──► 401 "Invalid email or password."
       │
  email not verified ──► refresh verify token, resend email ──► 403
       │
       ▼
Sign access token + refresh token (same JWT payload: uid, email, role)
       │
       ▼
Store refresh token in Redis (auth:refresh:<userId>, 7 day TTL)
       │
       ▼
200 OK
  body: { user, accessToken }                    ← accessToken also in body for mobile clients
  Set-Cookie: access_token=<token>;  HttpOnly; SameSite=none; Secure; Domain=.talkhead.ai; Max-Age=900
  Set-Cookie: refresh_token=<token>; HttpOnly; SameSite=none; Secure; Domain=.talkhead.ai; Max-Age=604800
```

### Logout

```
POST /api/v1/auth/logout
Cookie: refresh_token=<token>
       │
       ▼
Verify refresh token → extract userId
       │
       ▼
Delete auth:refresh:<userId> from Redis
       │
       ▼
Clear access_token + refresh_token cookies
       │
       ▼
200 OK
```

### Refresh access token (explicit, for mobile)

Web clients never need to call this — the `authenticate` middleware silently refreshes
the access token cookie when it expires. Mobile clients that use the Bearer header
should call this endpoint to get a new token.

```
POST /api/v1/auth/refresh-token
Cookie: refresh_token=<token>
       │
       ▼
Verify JWT signature
       │
       ▼
Compare against Redis — must match exactly (prevents replay after logout)
       │
       ▼
200 OK  { accessToken: "eyJ..." }
Set-Cookie: access_token=<token>; HttpOnly; ...
```

### Silent token refresh (web clients — automatic)

The `authenticate` middleware handles this transparently:

```
Request arrives with expired access_token cookie
       │
       ▼
JwtHelper.verifyAccessToken → TokenExpiredError
       │
       ▼
Read refresh_token cookie
  missing ──► 401 "Session expired. Please log in again."
  invalid ──► 401
  not in Redis (revoked) ──► 401
       │
       ▼
Issue new access_token cookie + proceed with original request
  Set-Cookie: access_token=<newToken>; HttpOnly; ...
       │
       ▼
Request succeeds — user never sees a 401
```

> **Proxy required for web:** The new access token cookie is set by the backend in the
> API response. If the frontend uses a proper reverse-proxy route handler (see
> `docs/guides/frontend-proxy-setup.md`), the `Set-Cookie` header is forwarded to the
> browser and the cookie updates transparently. A plain URL rewrite (e.g. Next.js
> `rewrites()`) drops response headers and will swallow the new cookie.

### Forgot password

```
POST /api/v1/auth/forgot-password
{ email }
       │
       ▼
Look up user by email
  not found ──► return silently (prevents email enumeration)
       │
       ▼
Generate 1h reset token → store in Redis → send reset email with link
  link: FRONTEND_RESET_PAGE_URL?token=<token>&userId=<id>
       │
       ▼
200 OK  (same message whether email existed or not)
```

### Reset password

```
POST /api/v1/auth/reset-password
{ userId, token, password }
       │
       ▼
Validate token from Redis (auth:reset:<userId>) — must match exactly
       │
       ▼
Hash new password + update user
       │
       ▼
Delete reset token + refresh token from Redis (forces re-login on all devices)
       │
       ▼
200 OK
```

### Verify email

```
POST /api/v1/auth/verify-email
{ userId, token }
       │
       ▼
Validate token from Redis (auth:verify:<userId>)
       │
       ▼
Mark user isVerified = true + delete verify token
       │
       ▼
200 OK
```

---

## 2. Google OAuth flow

The OAuth flow uses a **one-time claim code** to transfer the session from the backend
to the frontend. This solves the cross-domain cookie problem: cookies set by
`api.talkhead.ai` cannot be read by `app.talkhead.ai` or `localhost:3000`, but a
short-lived Redis code can be exchanged via a direct API call.

It also supports **dynamic redirect origins**: the frontend passes its own
`window.location.origin` when starting the flow, so the same backend works for
`localhost:3000` in development and `https://demo.talkhead.ai` in production
without any configuration change.

```
STEP 1 — Frontend navigates browser to backend, passing its own origin
  GET /api/v1/auth/social/google?origin=https://app.example.com

STEP 2 — Backend validates origin against CORS_ALLOWED_ORIGINS whitelist,
          encodes it in the OAuth state parameter, redirects to Google
  → https://accounts.google.com/o/oauth2/auth?...&state=https://app.example.com

STEP 3 — User approves on Google

STEP 4 — Google redirects browser back to backend (state is returned unchanged)
  GET /api/v1/auth/social/google/callback?code=xyz&state=https://app.example.com

STEP 5 — Backend re-validates origin from state (open-redirect guard)

STEP 6 — Backend exchanges code for Google profile (server-to-server)

STEP 7 — Backend runs find-or-create logic:
  a. Find user by googleId → returning user, skip to STEP 8
  b. Find user by email    → link googleId to existing account (account merging)
  c. Neither found         → create new user (isVerified = true, Google confirmed email)

STEP 8 — Backend issues tokens (identical to normal login):
  - Sign access token + refresh token
  - Store refresh token in Redis (auth:refresh:<userId>)

STEP 9 — Backend creates a one-time claim code in Redis
  - code = UUID → stored as auth:social-code:<uuid>
  - value = { accessToken, refreshToken }
  - TTL = 2 minutes, single-use

STEP 10 — Backend redirects browser to the frontend callback URL
  302 → <origin>/auth/callback?code=<uuid>

STEP 11 — Frontend /auth/callback route handler (server-side, e.g. Next.js Route Handler):
  POST /api/v1/auth/social/claim  { code: "<uuid>" }
       │
       ▼  (server-to-server call — bypasses browser cookie restrictions)
  Backend:
    - Looks up auth:social-code:<uuid> in Redis
    - Deletes it immediately (single-use)
    - Sets access_token + refresh_token as httpOnly cookies in the response
       │
       ▼
  Route handler forwards the Set-Cookie headers in its own redirect response
  → 302 /profile   (with Set-Cookie headers bound to the frontend domain)

STEP 12 — Browser stores cookies for the frontend domain
          Session established — identical to email/password login from here
```

### POST /auth/social/claim — quick reference

This is the only endpoint in the social flow that a frontend developer needs to call
manually (all other steps are browser redirects handled automatically).

```
POST /api/v1/auth/social/claim
Content-Type: application/json

{ "code": "550e8400-e29b-41d4-a716-446655440000" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | UUID string | ✅ | The value from the `?code=` query param in the `/auth/callback` redirect |

**Response 200** — sets two httpOnly cookies, identical to a regular login:

```
Set-Cookie: access_token=<jwt>;  HttpOnly; SameSite=none; Secure; Domain=.talkhead.ai; Max-Age=900
Set-Cookie: refresh_token=<jwt>; HttpOnly; SameSite=none; Secure; Domain=.talkhead.ai; Max-Age=604800

{ "success": true, "message": "Social login successful." }
```

**Response 401** — code expired (> 2 min) or already used:
```json
{ "success": false, "message": "Invalid or expired auth code." }
```

**Important:** this call must be made **server-side** (e.g. Next.js Route Handler), not
from the browser directly. The route handler then forwards the `Set-Cookie` headers in
its own redirect response so the browser binds the cookies to the frontend domain, not
the backend API domain.

---

### Why the claim code approach

| Problem | Solution |
|---|---|
| Backend cookies bound to `api.talkhead.ai` — not readable by frontend | Code exchange via direct fetch (not cross-domain cookie) |
| Access token in `?token=` URL param — visible in browser history/logs | Opaque UUID code — tokens never appear in URLs |
| Single backend deployed, multiple frontend origins (dev + prod) | Origin passed as `?origin=` and encoded in OAuth state |
| Code could be stolen and replayed | Single-use (deleted on first claim) + 2-min TTL |

### Dynamic redirect origin

The same deployed backend serves multiple frontend environments:

```
Local dev:   GET /api/v1/auth/social/google?origin=http://localhost:3000
Production:  GET /api/v1/auth/social/google?origin=https://app.example.com
```

The origin is validated against `CORS_ALLOWED_ORIGINS` before use. Unrecognised or
missing origins fall back to `FRONTEND_SOCIAL_CALLBACK_URL` env var.
The validated origin is re-checked in the callback — it is never used as an open redirect.

**Frontend implementation note:** the `?origin=` value must be read from
`window.location.origin` at click time (not at render/SSR time) so it always reflects
the actual domain the user is on. Reading it during server-side rendering can produce
an empty string, causing the backend to ignore it and fall back to the env var.

### Account merging

If a user registers with `alice@gmail.com` via email/password, then later
clicks "Sign in with Google" using the same Gmail address:

- Their existing account is found by email
- `googleId` is linked to the existing document
- Password is **not removed** — they can continue to sign in both ways
- `isVerified` is set to `true` if it wasn't already

### Profile picture from OAuth

The Google profile picture URL is stored directly in `profilePictureKey` when the account
is created. On every `GET /auth/me` (and `login` / `updateProfile`), `resolveProfilePictureUrl` resolves it and the result is returned as `profilePictureUrl` in the response — `profilePictureKey` always keeps the raw stored value:

| Stored value | Action |
|---|---|
| Full `https://` URL (Google, custom R2 domain) | Returned as-is |
| Bare R2 file key (e.g. `avatars/uuid.webp`) | Presigned URL generated (15 min validity), cached in Redis for 10 min |
| `null` / empty | `null` returned — client shows initials fallback |

---

## 3. Shared token resolution — `resolveSession()` and `resolveSocketSession()`

HTTP and Socket.io use **different** resolution functions because only HTTP can issue new cookies.

### 3a. HTTP — `resolveSession()`

Used by the `authenticate` middleware for all REST endpoints.

```ts
// src/App/Auth/utils.ts
resolveSession(accessToken?, refreshToken?) → TResolvedSession
```

Resolution order:
1. **Access token valid** → return immediately (no Redis check needed)
2. **Access token invalid or expired** (any error) → fall through to refresh token
3. **Refresh token** → verify JWT + Redis revocation check (`auth:refresh:<userId>`) → return session
4. **No valid token** → throw `"Session expired. Please log in again."`

The `authenticate` HTTP middleware also writes a new `Set-Cookie: access_token` when the session was refreshed (`session.refreshed === true`), so the browser gets an updated token transparently.

### 3b. Socket.io — `resolveSocketSession()`

Used by `socketAuthMiddleware` in `src/Config/socket/middleware.ts`. Skips the Redis revocation check.

```ts
// src/App/Auth/utils.ts
resolveSocketSession(accessToken?, refreshToken?) → TResolvedSession
```

Resolution order:
1. **Access token valid** → return immediately
2. **Access token invalid or expired** → fall through to refresh token
3. **Refresh token** → verify JWT signature + expiry **only** (no Redis check) → return session
4. **No valid token** → throw `"Authentication required."`

**Why no Redis check for sockets?**

The Redis check exists to enforce logout revocation — after `POST /auth/logout`, the refresh token is deleted from Redis so it can't be used again. However, requiring this check on the socket transport causes false rejections in legitimate scenarios:

- Redis is momentarily unreachable (restart, network blip)
- A token rotation race: the access token expired, the frontend is mid-refresh via HTTP, and the socket reconnects in the gap before the new token is in Redis
- Redis state was cleared during a deploy

The socket transport has no mechanism to issue a new cookie mid-connection, so it cannot recover from these failures the way HTTP can. The 7-day JWT expiry on the refresh token provides the time-bound guarantee.

**If hard revocation is needed** (e.g. admin kick, forced logout of a specific user), use:
```ts
io.in(`user:${userId}`).disconnectSockets();
```

The socket middleware does not issue a new cookie — the socket continues with refresh-token identity until the next HTTP request refreshes the access token.

---

## 4. Protected routes

```ts
// Require authentication only
router.get("/me", authenticate, controller)

// Require authentication + specific role
router.delete("/users/:id", authenticate, AccessLimit(["admin"]), controller)
```

`authenticate` reads the access token from the `access_token` cookie first, falling
back to the `Authorization: Bearer <token>` header for mobile clients. It delegates to
`resolveSession()`, sets `req.user = { uid, email, role }`, and issues a refreshed
access token cookie when the old one was expired.

`AccessLimit(roles)` checks `req.user.role` against the allowed list and
returns **403** (not 401) if the role doesn't match.

---

## 4. Adding a new OAuth provider (e.g. GitHub)

1. `pnpm add passport-github2 && pnpm add -D @types/passport-github2`
2. Add `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` to `.env` + `.env.example`
3. Add optional `github` config block to `src/Config/index.ts`
4. Add `githubId?: string` to `src/App/Auth/model.ts` + `types.ts`
5. Create `src/App/Auth/social/strategies/github.strategy.ts`
   - Import + register in `src/app.ts` (one side-effect import line)
6. Copy `googleAuth` + `googleCallback` pattern in `src/App/Auth/social/controller.ts`
   — the `validateOrigin` / `redirectToFrontend` helpers are shared, no duplication
7. Add `"github"` to the `provider` union in `src/App/Auth/social/types.ts`
8. Uncomment the GitHub section in `src/App/Auth/social/routes.ts`

`SocialAuthService.socialLogin` requires **zero changes** — the `provider` field
drives the dynamic field name (`githubId`, `googleId`, etc.) automatically.
The `POST /auth/social/claim` endpoint is provider-agnostic and works for all.
