# Authentication flow

Two authentication methods are supported. They produce the exact same token
format and the same end state — the client cannot distinguish which was used.

---

## Tokens

| Token | Where | Lifetime | Purpose |
|---|---|---|---|
| **Access token** | JSON response body / URL `?token=` | 15 min | Bearer token for API requests |
| **Refresh token** | `httpOnly` cookie (`refresh_token`) | 7 days | Obtain a new access token when the current one expires |

The refresh token is stored in Redis on login and deleted on logout/password-change/reset,
enabling instant revocation even before the JWT itself expires.

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
  body: { user, accessToken }
  Set-Cookie: refresh_token=<token>; HttpOnly; SameSite=lax; Max-Age=604800
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
Clear refresh_token cookie
       │
       ▼
200 OK
```

### Refresh access token

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
```

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

```
STEP 1 — Client redirects browser to backend
  GET /api/v1/auth/social/google

STEP 2 — Backend redirects browser to Google consent screen
  → https://accounts.google.com/o/oauth2/auth?client_id=...&redirect_uri=...

STEP 3 — User approves on Google

STEP 4 — Google redirects browser back to backend
  GET /api/v1/auth/social/google/callback?code=xyz123

STEP 5 — Backend exchanges code for Google profile (server-to-server, invisible to user)

STEP 6 — Backend runs find-or-create logic:
  a. Find user by googleId → returning user, skip to STEP 7
  b. Find user by email    → link googleId to existing account (account merging)
  c. Neither found         → create new user (isVerified = true, Google confirmed email)

STEP 7 — Backend issues tokens (identical to normal login):
  - Sign access token + refresh token
  - Store refresh token in Redis

STEP 8 — Backend sets httpOnly cookie + redirects browser to frontend
  Set-Cookie: refresh_token=<token>; HttpOnly
  302 → FRONTEND_SOCIAL_CALLBACK_URL?token=<accessToken>

STEP 9 — Frontend page at /auth/callback:
  const token = new URLSearchParams(location.search).get("token");
  storeAccessToken(token);  // identical to what login page does
  redirect("/dashboard");
```

### Side-by-side comparison

```
Email/password login                    Google OAuth login
────────────────────────────────────    ────────────────────────────────────
POST /api/v1/auth/login                 Browser GET /api/v1/auth/social/google
  ↓                                       ↓ (redirect chain via Google)
Backend verifies password               Backend verifies Google profile
  ↓                                       ↓
Issues access + refresh tokens          Issues access + refresh tokens (same)
  ↓                                       ↓
JSON: { user, accessToken }             302 → /auth/callback?token=<accessToken>
Set-Cookie: refresh_token               Set-Cookie: refresh_token
  ↓                                       ↓
Frontend stores accessToken             Frontend reads ?token= → stores accessToken
  ↓                                       ↓
  ────── IDENTICAL FROM HERE ──────────────────────────────────────────────
Bearer <accessToken> on every API call
GET /api/v1/auth/me → full user profile
```

### Account merging

If a user registers with `alice@gmail.com` via email/password, then later
clicks "Sign in with Google" using the same Gmail address:

- Their existing account is found by email
- `googleId` is linked to the existing document
- Password is **not removed** — they can continue to sign in both ways
- `isVerified` is set to `true` if it wasn't already

---

## 3. Protected routes

```ts
// Require authentication only
router.get("/me", authenticate, controller)

// Require authentication + specific role
router.delete("/users/:id", authenticate, AccessLimit(["admin"]), controller)
```

`authenticate` validates the `Authorization: Bearer <token>` header, verifies
the JWT, and sets `req.user = { uid, email, role }`.

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
6. Add `githubAuth` + `githubCallback` to `src/App/Auth/social/controller.ts`
7. Add `"github"` to the `provider` union in `src/App/Auth/social/types.ts`
8. Uncomment the GitHub section in `src/App/Auth/social/routes.ts`

`SocialAuthService.socialLogin` requires **zero changes** — the `provider` field
drives the dynamic field name (`githubId`, `googleId`, etc.) automatically.
