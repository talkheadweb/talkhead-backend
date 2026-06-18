# Deployment

---

## Environment variables

Copy `.env.example` to `.env` and fill in every **required** variable.
The server crashes at startup if any required variable is missing (Zod validation).

### Required

| Variable | Example | Description |
|---|---|---|
| `APP_NAME` | `talkhead backend` | Application name (used in email subjects, logs) |
| `NODE_ENV` | `production` | `development` \| `production` |
| `BACKEND_BASE_URL` | `https://api.example.com` | Full base URL of this server (used in OAuth callback URLs) |
| `MONGO_URI` | `mongodb+srv://...` | MongoDB connection string |
| `REDIS_HOST` | `redis` | Redis hostname |
| `REDIS_PASSWORD` | `s3cr3t` | Redis auth password |
| `JWT_ACCESS_TOKEN_SECRET` | *(32+ random chars)* | Access token signing secret |
| `JWT_REFRESH_TOKEN_SECRET` | *(32+ random chars)* | Refresh token signing secret |
| `RESEND_API_KEY` | `re_xxxx` | [Resend](https://resend.com) API key |
| `ADMIN_CONTACT_EMAIL` | `no-reply@example.com` | Sender address for transactional emails |
| `CLOUDFLARE_ACCOUNT_ID` | `abc123` | Cloudflare account ID |
| `CLOUDFLARE_ACCESS_KEY_ID` | `key` | R2 access key ID |
| `CLOUDFLARE_SECRET_ACCESS_KEY` | `secret` | R2 secret access key |
| `CLOUDFLARE_BUCKET_NAME` | `uploads` | R2 bucket name |
| `FRONTEND_VERIFY_PAGE_URL` | `https://app.example.com/verify-email` | Email verification page |
| `FRONTEND_RESET_PAGE_URL` | `https://app.example.com/reset-password` | Password reset page |
| `CORS_ALLOWED_ORIGINS` | `https://app.example.com` | Comma-separated list of allowed origins |

### Optional

| Variable | Default | Description |
|---|---|---|
| `PORT` | `9000` | HTTP server port |
| `REDIS_PORT` | `6379` | Redis port |
| `JWT_ACCESS_TOKEN_EXPIRE_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_TOKEN_EXPIRE_IN` | `7d` | Refresh token lifetime |
| `BCRYPT_SALT_ROUNDS` | `12` | bcrypt rounds (never go below 10 in production) |
| `AUTH_COOKIE_SAMESITE` | `none` (prod) / `lax` (dev) | Cookie SameSite policy |
| `AUTH_COOKIE_SECURE` | `true` if SameSite=none | Cookie Secure flag |
| `AUTH_COOKIE_DOMAIN` | `.talkhead.ai` (prod) / unset (dev) | Cookie domain scope — leading dot required for subdomain sharing |
| `CLOUDFLARE_REGION` | `auto` | R2 region |
| `CLOUDFLARE_CUSTOM_DOMAIN` | — | CDN domain for public R2 URLs |
| `FRONTEND_SOCIAL_CALLBACK_URL` | — | OAuth success/failure redirect (required if using social login) |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `APPLICATION_LOG_LEVEL` | `debug` | Minimum log level (`debug`\|`info`\|`warn`\|`error`) |
| `APPLICATION_LOG_DIR` | `../application-logs` | Log file directory |
| `APPLICATION_LOG_MAX_FILES` | `15d` | Log retention period |
| `APPLICATION_LOG_MAX_SIZE` | `20m` | Max log file size before rotation |
| `RATE_LIMIT_GLOBAL_MAX` | `300` | Global rate limit (req / 1 min, production only) |
| `RATE_LIMIT_AUTH_MAX` | `10` | Login attempts (per 15 min) |
| `RATE_LIMIT_EMAIL_MAX` | `5` | Email-sending requests (per 1 hr) |
| `MONGO_URI` | `mongodb://user:pass@mongo-server:27017/db?authSource=admin` | MongoDB connection string (see URI formats in `.env.example`) |
| `MONGO_ROOT_USERNAME` | `admin` | MongoDB root username (Docker Compose only — init-only, read once on first deploy) |
| `MONGO_ROOT_PASSWORD` | *(strong password)* | MongoDB root password (Docker Compose only — init-only) |
| `MONGO_DB_NAME` | `talkhead-backend` | MongoDB database name (Docker Compose only) |
| `MONGO_WIREDTIGER_CACHE_GB` | `0.5` | MongoDB RAM cache size in GB (Docker Compose only) |
| `MONGO_MEMORY_LIMIT` | `700M` | Docker hard memory ceiling for MongoDB — must be cache × 1024 + 200 MB |
| `MONGO_MEMORY_RESERVATION` | `128M` | Docker soft scheduling hint for MongoDB |

---

## Generating JWT secrets

```bash
# Generate two different secrets — one for access, one for refresh
openssl rand -hex 32
openssl rand -hex 32
```

---

## Docker (recommended)

The `docker-compose.yml` starts the app and Redis together.

```bash
# Build and start
docker compose up --build

# Start in background
docker compose up -d --build

# View logs
docker compose logs -f app

# Stop + remove volumes
docker compose down -v
```

The app runs as non-root (`node` user). Redis data persists in the `redis_data` volume.

**Production Docker notes:**
- Set `NODE_ENV=production` in the environment
- Set `AUTH_COOKIE_SAMESITE=none`, `AUTH_COOKIE_SECURE=true`, and `AUTH_COOKIE_DOMAIN=.talkhead.ai` for cross-origin subdomain deployments
- Mount a volume for logs if you want log persistence outside the container
- Consider a reverse proxy (nginx / Caddy) in front for TLS termination

---

## Running without Docker

Prerequisites: Node.js 22+, pnpm, MongoDB, Redis.

```bash
pnpm install
pnpm build          # compile TypeScript → dist/
pnpm start          # run dist/index.js
```

Or with a process manager:
```bash
pnpm install -g pm2
pm2 start dist/index.js --name talkhead-backend
pm2 save
pm2 startup
```

---

## Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add authorised redirect URI:
   ```
   {BACKEND_BASE_URL}/api/v1/auth/social/google/callback
   ```
   Example: `https://api.example.com/api/v1/auth/social/google/callback`
4. Copy Client ID and Client Secret → `.env`:
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   FRONTEND_SOCIAL_CALLBACK_URL=https://app.example.com/auth/callback
   ```

---

## Cookie configuration

Three env vars control cookie behaviour. All three must be consistent:

| Setup | `AUTH_COOKIE_SAMESITE` | `AUTH_COOKIE_SECURE` | `AUTH_COOKIE_DOMAIN` |
|---|---|---|---|
| Local HTTP development | `lax` | `false` | *(unset)* |
| Dev server sharing root domain with prod | `none` | `true` | `.talkhead.ai` |
| Prod server | `none` | `true` | `.talkhead.ai` |
| Frontend + API on completely different domains | `none` | `true` | *(unset)* |

**Cookie name isolation (automatic):** cookie names are derived from `NODE_ENV` automatically — no extra config needed:

| `NODE_ENV` | Cookie names |
|---|---|
| `development` | `access_token_dev`, `refresh_token_dev` |
| `production` | `access_token`, `refresh_token` |

When dev and prod share the same root domain, the browser sends `Domain=.talkhead.ai` cookies to both environments. Because the names differ, a dev login cookie is invisible to prod and vice versa. The ultimate security boundary is always the JWT secret (different per env) — the name difference is a clean first layer that prevents cross-env noise entirely.

**Why `AUTH_COOKIE_DOMAIN` is required for subdomain deployments:**

HTTP requests from the browser go through the Next.js proxy at `demo.talkhead.ai`. The browser stores cookies under `demo.talkhead.ai`. Socket.io connects **directly** from the browser to `dev-api.talkhead.ai` — a different host. Without a shared domain, the browser won't send the cookies on the socket handshake.

Setting `Domain=.talkhead.ai` (leading dot = all subdomains) makes the cookies available to every `*.talkhead.ai` host, so both the proxy and the direct socket connection receive them.

`SameSite=None` requires `Secure=true` — browsers silently reject the cookie otherwise.

---

## Cloudflare R2 setup

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com) → R2
2. Create a bucket
3. Create an API token with **Object Read & Write** permissions
4. (Optional) Add a custom domain to the bucket for public CDN URLs
5. Copy credentials → `.env`

If `CLOUDFLARE_CUSTOM_DOMAIN` is set, uploaded file URLs are returned as
`https://{customDomain}/{fileKey}`. Otherwise `fileKey` is returned for use
with `getPresignedUrl()`.

---

## Production checklist

- [ ] `NODE_ENV=production`
- [ ] All required env vars set (server will crash otherwise)
- [ ] JWT secrets are long random strings (32+ chars), not guessable phrases
- [ ] `BCRYPT_SALT_ROUNDS=12` minimum
- [ ] HTTPS enabled (required for `SameSite=None` cookies and OAuth)
- [ ] `AUTH_COOKIE_SAMESITE=none`, `AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_DOMAIN=.yourdomain.com`
- [ ] `CORS_ALLOWED_ORIGINS` set to exact frontend origin(s), no wildcard `*`
- [ ] Google OAuth redirect URI registered in Google Cloud Console
- [ ] Swagger UI is disabled in production (automatically — gated by `node_env`)
- [ ] Redis password is set (`REDIS_PASSWORD`)
- [ ] Log directory is writable and persisted
- [ ] Rate limits reviewed for your expected traffic (`RATE_LIMIT_*`)
- [ ] `NODE_ENV=production` on prod server, `NODE_ENV=development` on dev server (cookie suffix is derived automatically)
- [ ] JWT secrets are **different** between dev and prod (generate independently with `openssl rand -hex 32`)
- [ ] MongoDB connection string uses a dedicated user with least-privilege access
- [ ] MongoDB Docker memory values set correctly (`MONGO_WIREDTIGER_CACHE_GB` × 1024 + 200 MB < `MONGO_MEMORY_LIMIT`)
- [ ] See [`docs/guides/mongodb-docker.md`](guides/mongodb-docker.md) for MongoDB memory tuning and credential rotation procedures
- [ ] See [`docs/guides/promote-admin.md`](guides/promote-admin.md) for bootstrapping the first admin account
