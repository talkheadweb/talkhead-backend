# CLAUDE.md — Project Intelligence for Claude Code

## Project Overview

**express-ts-starter** — A production-ready Node.js/Express/TypeScript REST API backend starter.

Stack: Express · TypeScript · MongoDB (Mongoose) · Redis (ioredis) · Zod · Winston · Cloudflare R2 · Resend · pnpm

---

## Commands

```bash
pnpm dev            # Start dev server (nodemon + ts-node + tsconfig-paths)
pnpm build          # Compile TypeScript → dist/
pnpm start          # Run compiled dist/index.js (production)
pnpm test           # Run Jest test suite
pnpm test:coverage  # Run tests with coverage report
```

---

## Architecture

### Entry point flow

```
src/index.ts
  → connectDB()      # MongoDB connects first
  → bootstrap()      # temp file cleanup, Redis index init, cache warm-up
  → server.listen()  # HTTP server starts last
```

`src/app.ts` is a pure Express app factory — no side-effects, no startup logic.

### Folder structure

```
src/
  Config/
    index.ts             # Zod-validated env config (single source of truth)
    db.ts                # Mongoose connection + event logging
    redis/
      connection.ts      # Main Redis client (RedisClient) — regular commands
      events.ts          # Keyspace event client (RedisEventClient) — pub/sub only
    logger/
      index.ts           # CustomLogger class
      utils.ts           # baseLogger + LogService export
      types.ts           # ServiceList (NETWORK, SYSTEM, APPLICATION, REDIS, DATABASE, AUTH)
    swagger/
      helpers.ts         # Builder DSL — read the legend at the top once
      index.ts           # OpenAPI spec assembly — imports paths from each module
    utils/
      config.types.ts    # ENodeEnv enum

  Routes/
    config.ts            # Mounts globalLimiter + /api/v1 + /health
    index.ts             # rootRouter — add feature routes here

  Middlewares/
    Auth/index.ts           # authenticate — validates Bearer token, sets req.user
    AccessLimit/index.ts    # AccessLimit(["admin"]) — role guard, use after authenticate
    RateLimit/index.ts      # createRateLimiter factory + globalLimiter/loginLimiter/emailLimiter
    validateRequest/index.ts # validateRequest(zodSchema) — Zod body validation
    Debug/index.ts          # Per-request logger (method, status, duration, IP, body)
    Debug/morganMiddleware.ts # Morgan HTTP logger → LogService.NETWORK
    Errors/
      globalErrorHandler.ts  # Handles CustomError, ZodError, MulterError, MongooseError
      notFoundHandler.ts     # 404 fallback

  App/
    Auth/
      routes.ts          # Auth route definitions
      controller.ts      # Request/response handling
      service.ts         # Business logic
      model.ts           # Mongoose User schema
      validation.ts      # Zod schemas for all auth endpoints
      types.ts           # IUser, TUserPublic, DTOs, EUserRole
      const.ts           # AUTH_TTL, AUTH_REDIS_PREFIX, COOKIE_NAME, cookie options
      utils.ts           # toPublicUser, emailTemplates
      redisService.ts    # AuthRedisService — refresh/verify/reset token storage
      auth.swagger.ts    # OpenAPI path definitions for this module

  Utils/
    errors/customError.class.ts   # throw new CustomError(message, statusCode)
    helper/
      catchAsync.ts       # Wraps async handlers, forwards errors to next()
      sendResponse.ts     # sendResponse.success / sendResponse.error (auto-cleans temp files)
      hashHelper.ts       # HashHelper.generateHashPassword / comparePassword (bcryptjs)
      queryOptimize.ts    # calculatePagination, manageSorting, queryOptimization, MongoQueryHelper
      jwtHelper.ts        # JwtHelper.sign/verify for access and refresh tokens
      pickFunction.ts     # Pick keys from object
    mail/
      resend.ts           # MailUtils.sendMail — active email client (Resend)
    file/
      config.ts           # Multer diskStorage → temp-uploads/ (dir created at startup)
      upload.ts           # R2 upload/delete/presigned URL helpers
      type.ts             # R2Config interface, allowedMimes
    redis/
      index.ts            # Re-exports RedisJSON, RedisSearch
      services/json.service.ts    # JSON.SET/GET/MGET/DEL/SCAN via RedisJSON module
      services/search.service.ts  # FT.CREATE/SEARCH via RediSearch module
      logic/query.ts      # buildQuery — tag/text/numeric condition builder
      types.ts            # Condition, SearchOptions, SearchResult, SchemaField types
    validation/
      zod.validation.ts       # processZodValidation.errorValidation
      mongoose.validation.ts  # processMongooseValidationError, isValidMongoID
    CodeGenerator/
      index.ts            # CodeGeneratorUtils.generate / generateOne
      types.ts            # ECodeGeneratorCharset, TCodeGeneratorConfig
    types/
      errors.type.ts      # TGenericErrorMessages
      response.type.ts    # TCustomErrorResponse, TGenericSuccessMessages
      query.type.ts       # TPaginationOptions, TSortOptions, TMeta, TDataWithMeta
      jwtHelper.type.ts   # CustomJwtPayload (uid, email, role)

  types/
    express/index.d.ts   # Augments Express.Request with req.user: { uid, email, role }

  bootstrap.ts           # Runs at startup: cleanupTempFiles, initRedisIndex, refreshRedisCache

__tests__/
  Auth/                  # One test file per endpoint (register, login, logout, …)
  Middlewares/
    rateLimit.test.ts
  _mocks/
    loggerUtils.ts       # Silences logger in tests
    redisConnection.ts   # Prevents real Redis connections in tests
```

---

## Config

All environment config lives in `src/Config/index.ts` — validated with Zod at startup. If any required variable is missing the process crashes immediately with a clear error.

Copy `.env.example` → `.env` and fill in values before running.

Key config keys:
- `config.appName`
- `config.port` — server port
- `config.node_env` — `ENodeEnv.DEV` | `ENodeEnv.PROD`
- `config.mongo_uri`
- `config.redis.{host, port, password}`
- `config.auth.cookie.{sameSite, secure}`
- `config.jwt.{accessToken, refreshToken}.{secret, exp}`
- `config.mail.{resend_api_key, admin_contact_email}`
- `config.cloudflare_r2.{accountId, accessKeyId, secretAccessKey, bucketName, region, customDomain}`
- `config.frontend.{verify_page_url, reset_page_url}`
- `config.bcrypt_saltRounds`
- `config.rate_limit.{global, auth, email}.{windowMs, max}`

---

## Adding a feature module

1. Create `src/App/<FeatureName>/` with `controller.ts`, `service.ts`, `model.ts`, `routes.ts`, `types.ts`, `validation.ts`
2. Add Swagger docs in `src/App/<FeatureName>/<featureName>.swagger.ts`
3. Register routes in `src/Routes/index.ts`:
   ```ts
   rootRouter.use('/feature-name', featureRoutes)
   ```
4. Register swagger in `src/Config/swagger/index.ts`:
   ```ts
   import { featurePaths } from "@/App/<FeatureName>/<featureName>.swagger"
   // spread into paths: { ...authPaths, ...featurePaths }
   // add tag: { name: "<FeatureName>", description: "..." }
   ```
5. Add test files in `__tests__/<FeatureName>/` — one file per endpoint
6. If Redis caching needed, add index creation to `bootstrap.ts → initRedisIndex()`

---

## Authentication pattern

- `authenticate` middleware validates Bearer token and sets `req.user: { uid, email, role }`
- Protected routes: `router.get("/me", authenticate, controller)`
- Role-guarded routes: `router.delete("/x", authenticate, AccessLimit(["admin"]), controller)`
- Access userId in controllers: `req.user!.uid` — never `req.headers["uid"]`

---

## Rate limiting

```ts
import { globalLimiter, loginLimiter, emailLimiter, createRateLimiter } from "@/Middlewares/RateLimit"

// Applied automatically on all /api/v1 routes via Routes/config.ts
globalLimiter

// Use on specific routes
router.post("/login",    loginLimiter,  ...)  // IP key, 5 attempts / 15 min
router.post("/register", emailLimiter,  ...)  // IP+email key, 3 attempts / 1 hr
```

Limits are configurable via env vars: `RATE_LIMIT_GLOBAL_*`, `RATE_LIMIT_AUTH_*`, `RATE_LIMIT_EMAIL_*`

---

## Swagger / API docs

Docs are served at `/api/docs` (dev only — disabled in production).

Each module owns its own `<module>.swagger.ts`. The builder DSL is in `Config/swagger/helpers.ts` — read the legend comment at the top once and every path file reads like plain English.

---

## Logging

Use `LogService.<SERVICE>` — never `console.log` in application code.

```ts
import { LogService } from '@/Config/logger/utils'

LogService.APPLICATION.info('message')
LogService.APPLICATION.error('label', new Error('...'))
LogService.DATABASE.warn('slow query', { ms: 200 })
LogService.REDIS.debug('cache hit', { key })
LogService.NETWORK.http('...')
LogService.AUTH.info('user logged in', { userId })
```

Available services: `APPLICATION`, `DATABASE`, `REDIS`, `NETWORK`, `AUTH`, `SYSTEM`

---

## Error handling

```ts
import CustomError from '@/Utils/errors/customError.class'
throw new CustomError('Not found', 404)
```

Wrap all async route handlers with `catchAsync`:

```ts
import catchAsync from '@/Utils/helper/catchAsync'
const handler = catchAsync(async (req, res, next) => { ... })
```

Send responses via `sendResponse`:

```ts
import { sendResponse } from '@/Utils/helper/sendResponse'
sendResponse.success(res, { statusCode: 200, message: 'OK', data, meta, req })
sendResponse.error(res, { statusCode: 400, message: 'Bad request', errorMessages: [], req })
```

---

## Path aliases

`@/` maps to `src/`. Handled by `tsconfig-paths` at dev time and `tsc-alias` at build time.

---

## Docker

```bash
docker compose up --build     # Build and start app + Redis
docker compose down -v        # Stop and remove volumes
```

App: `node:22-alpine` runs as non-root `node` user. Redis: `redis:7.4-alpine`. Data persisted in `redis_data` volume. App accessible at `http://localhost:9000`.

---

## Key conventions

- Use `ENodeEnv` enum from `@/Config/utils/config.types` for env checks — never compare raw strings
- File uploads land in `temp-uploads/` (multer) → immediately moved to Cloudflare R2
- Never import `process.env` directly — always use `config` from `@/Config`
- `sendResponse` automatically cleans up uploaded temp files on both success and error responses
- Role self-elevation is blocked — `role` field is stripped at registration; always defaults to `USER`
- Password validation: min 8, max 128 characters

---

## Search / filter / pagination pattern

**This is the project-wide standard. Every list endpoint must follow it exactly.**
Full reference: [`docs/patterns/query-filter.md`](docs/patterns/query-filter.md)

### 1 — Define key constants in `types.ts`

```ts
// Fields searched with regex $or (always String type)
export const FeatureSearchKeys: (keyof IModel)[] = ["name", "email"];

// Fields available for discrete filtering — type auto-derived from Mongoose schema
export const FeatureFilterKeys: (keyof IModel)[] = ["role", "isVerified", "isActive"];

// Extra keys NOT on the model schema (computed fields, join keys) — usually empty
export const FeatureExtraFilterKeys: string[] = [];

// Payload type from controller → service
export type TListPayload = IQueryItems<Partial<IModel>>;
```

### 2 — Controller: call `queryOptimization`, pass payload to service

```ts
import { queryOptimization } from "@/Utils/helper/queryOptimize";

const listItems = catchAsync(async (req, res) => {
  const payload = queryOptimization<IModel>(req, FeatureFilterKeys, FeatureExtraFilterKeys);
  const { items, meta } = await FeatureService.list(payload);
  sendResponse.success(res, { statusCode: 200, message: "...", data: items, meta, req });
});
```

### 3 — Service: build `$and` conditions array

```ts
import { calculatePagination, manageSorting, MongoQueryHelper } from "@/Utils/helper/queryOptimize";
import { Types } from "mongoose";

const list = async (query: TListPayload) => {
  const { page, limit, skip } = calculatePagination(query.paginationFields);
  const { sortBy, sortOrder } = manageSorting<IModel>(query.sortFields);
  const { search }   = query.searchFields as { search?: string };
  const filterFields = query.filterFields as Record<string, string>;

  const queryConditions: Record<string, unknown>[] = [];

  // Search — loop over SearchKeys, build $or with regex per field
  if (search) {
    const orConditions = FeatureSearchKeys.map(key =>
      MongoQueryHelper("String", String(key), search),
    );
    if (Types.ObjectId.isValid(search)) orConditions.push({ _id: String(search) });
    queryConditions.push({ $or: orConditions });
  }

  // Filters — loop over FilterKeys, derive type from Mongoose schema automatically
  for (const key of FeatureFilterKeys) {
    const value = filterFields[String(key)];
    if (!value) continue;

    // Add a custom override BEFORE the default when a key needs complex logic:
    // if (key === 'tags') { queryConditions.push({ tags: { $in: value.split(',') } }); continue; }

    const instance = Model.schema.path(String(key))?.instance as Parameters<typeof MongoQueryHelper>[0] | undefined;
    if (instance) queryConditions.push(MongoQueryHelper(instance, String(key), value));
  }

  const mongoQuery = queryConditions.length ? { $and: queryConditions } : {};

  const [docs, total] = await Promise.all([
    Model.find(mongoQuery).sort({ [String(sortBy)]: sortOrder }).skip(skip).limit(limit).lean(),
    Model.countDocuments(mongoQuery),
  ]);

  return { items: docs, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};
```

### Key rules

- **Never** write `if (filters.x !== undefined) filter.x = ...` chains — use the key loop
- **Never** hardcode `MongoQueryHelper` types — read them from `schema.path(key).instance`
- Mongoose instance names (`"String"`, `"Boolean"`, `"Number"`, `"Date"`, `"ObjectId"`) are the same strings `MongoQueryHelper` expects — no translation map needed
- `.sort({ [sortBy]: sortOrder })` — Mongoose accepts `"asc"` / `"desc"` directly, no `1 | -1` conversion
- Use `$and: queryConditions` — not a flat filter object — so each condition is composable and debuggable
- Custom / complex conditions: add an `if (key === '...')` block with `continue` before the schema-default line

### Key types & helpers

| Export | Location | Purpose |
|---|---|---|
| `IQueryItems<T>` | `Utils/types/query.type` | Structured payload: search · filter · pagination · sort |
| `queryOptimization<T>()` | `Utils/helper/queryOptimize` | Extracts `IQueryItems` from `req.query` |
| `calculatePagination()` | `Utils/helper/queryOptimize` | `{page?,limit?}` → `{page,limit,skip}` |
| `manageSorting<T>()` | `Utils/helper/queryOptimize` | `{sortBy?,sortOrder?}` → normalised sort (`"asc"`/`"desc"`) |
| `MongoQueryHelper()` | `Utils/helper/queryOptimize` | Builds a MongoDB filter fragment — String/Number/NumberRange/Boolean/Date/ObjectId |

---

## Mandatory rules for every new feature

These rules are non-negotiable. Every feature delivered in this project MUST satisfy all four requirements before it is considered complete.

### 1 — Swagger / API documentation

Every endpoint must have an OpenAPI definition in `src/App/<FeatureName>/<featureName>.swagger.ts` using the builder DSL in `Config/swagger/helpers.ts`. The spec must be registered in `src/Config/swagger/index.ts` (paths spread + tag added).

### 2 — Feature documentation

Create `docs/features/<featureName>.md` that covers:
- Endpoint table (method, path, description)
- Authentication / authorization requirements
- Request body / query parameter tables
- Response examples (success + common errors)
- Business rules and edge cases
- File structure

### 3 — Tests (mandatory coverage)

Create `__tests__/<FeatureName>/` with **one file per endpoint**. Each file must cover all of:

| Case type        | What to test                                            |
|------------------|---------------------------------------------------------|
| Happy path       | 200/201 success with expected response shape            |
| Validation       | 400 for missing fields, bad formats, constraint violations |
| Authentication   | 401 when no/invalid token is provided                   |
| Authorization    | 403 when wrong role accesses a protected route          |
| Business errors  | 404 not found, 409 conflict, 403 suspended, etc.        |

Use `jest.mock` to isolate DB and Redis. Never hit real infrastructure in unit/integration tests.

### 4 — CLAUDE.md awareness

If a new feature introduces a project-wide pattern (new middleware, new util, new naming convention), add a short note to the relevant section of this file so future Claude sessions are aware of it.

---

## Feature checklist (copy for each new feature)

```
[ ] src/App/<Feature>/ files created (controller, service, model, routes, types, validation)
[ ] src/App/<Feature>/<feature>.swagger.ts created and registered in Config/swagger/index.ts
[ ] Route registered in src/Routes/index.ts
[ ] docs/features/<feature>.md written
[ ] __tests__/<Feature>/ files written (one per endpoint, all case types covered)
[ ] CLAUDE.md updated if new patterns introduced
[ ] pnpm build passes (no TypeScript errors)
[ ] pnpm test passes (all tests green)
```
