# talkhead-backend

Production-ready Node.js / Express / TypeScript REST API starter.

**Stack:** Express · TypeScript · MongoDB (Mongoose) · Redis (ioredis) · Zod · Winston · Cloudflare R2 · Resend · Passport · pnpm · Docker

---

## Quick start

```bash
# 1. Clone and install
git clone <repo-url> && cd talkhead-backend
pnpm install

# 2. Configure environment
cp .env.example .env
# Open .env and fill in the required values (see docs/deployment.md)

# 3. Start development server
pnpm dev
# → http://localhost:9000
# → API docs: http://localhost:9000/api/docs
```

> **Docker alternative** — starts app + Redis together:
> ```bash
> docker compose up --build
> ```

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server with hot-reload (nodemon + ts-node) |
| `pnpm build` | Compile TypeScript → `dist/` |
| `pnpm start` | Run compiled production build |
| `pnpm test` | Run Jest test suite |
| `pnpm test:watch` | Tests in watch mode |
| `pnpm test:coverage` | Tests with coverage report |

---

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | System design, folder layout, request lifecycle |
| [Auth flow](docs/auth-flow.md) | Email/password + Google OAuth explained with diagrams |
| [Conventions](docs/conventions.md) | Code style, patterns, logging, error handling |
| [Contributing](docs/contributing.md) | Add features, add social providers, run tests |
| [Deployment](docs/deployment.md) | Environment variables, Docker, production checklist |

---

## API surface

| Base path | Description |
|---|---|
| `GET /health` | Health check — returns `"Healthy"` |
| `GET /api/docs` | Swagger UI (development only) |
| `/api/v1/auth/*` | Email/password authentication |
| `/api/v1/auth/social/*` | Social / OAuth login |

Full endpoint reference is in the Swagger UI at `/api/docs` when running in development.

---

## Project layout (top level)

```
src/
  App/            Feature modules (Auth, …)
  Config/         Env config, DB, Redis, Logger, Swagger
  Middlewares/    Auth guard, rate limiter, validator, error handlers
  Routes/         JSON API route registration
  Utils/          Shared helpers (errors, file, mail, redis, pagination, …)
  app.ts          Express factory
  bootstrap.ts    Startup tasks
  index.ts        Entry point
__tests__/        Jest tests (mirrors src/App + Middlewares)
docs/             Extended documentation
```

See [Architecture](docs/architecture.md) for the full breakdown.

---

## Key features

- **JWT auth** — access token in response body, refresh token as `httpOnly` cookie, Redis-backed revocation
- **Google OAuth** — social login with account merging; GitHub / others follow the same pattern
- **Role-based access** — `USER` / `ADMIN` roles; `AccessLimit(["admin"])` guard middleware
- **Rate limiting** — Redis-backed, per-IP; separate presets for global / login / email routes
- **File uploads** — multer → temp disk → Cloudflare R2 (auto-converted to WebP)
- **Email** — Resend transactional email; verify email, password reset, re-send flows
- **Redis caching** — RedisJSON + RediSearch wrappers ready to use
- **Graceful shutdown** — SIGTERM / SIGINT handled; connections drained before exit
- **Structured logging** — Winston with daily log rotation per service (`APPLICATION`, `AUTH`, `DATABASE`, …)
- **Zod validation** — every request body validated before it reaches a controller
- **OpenAPI / Swagger** — auto-generated docs; each module owns its own `*.swagger.ts`
