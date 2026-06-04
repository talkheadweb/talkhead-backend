# CLAUDE.md — Project Intelligence for Claude Code

## Project Overview

**talkhead-backend** — A production-ready Node.js/Express/TypeScript REST API backend starter.

Stack: Express · TypeScript · MongoDB (Mongoose) · Redis (ioredis) · Zod · Winston · Cloudflare R2 · pnpm

---

## Commands

```bash
pnpm dev          # Start dev server (nodemon + ts-node + tsconfig-paths)
pnpm build        # Compile TypeScript → dist/
pnpm start        # Run compiled dist/index.js (production)
```

No test runner is configured yet.

---

## Architecture

### Entry point flow

```
src/index.ts
  → connectDB()          # MongoDB connects first
  → bootstrap()          # Redis index init, cache warm-up
  → server.listen()      # HTTP server starts last
```

`src/app.ts` is a pure Express app factory — no side-effects, no startup logic.

### Folder structure

```
src/
  Config/
    index.ts             # Zod-validated env config (single source of truth)
    db.ts                # Mongoose connection
    redis/
      connection.ts      # Main Redis client (RedisClient)
      events.ts          # Keyspace event client (RedisEventClient)
      redisManager.ts    # Retry/backoff manager for Redis connections
    logger/
      index.ts           # CustomLogger class
      utils.ts           # baseLogger + LogService export
      types.ts           # ServiceList (NETWORK, SYSTEM, APPLICATION, REDIS, DATABASE, AUTH)
    utils/
      config.types.ts    # ENodeEnv enum

  Routes/
    config.ts            # Mounts /api/v1 + /health
    index.ts             # rootRouter — add feature routes here

  Middlewares/
    Debug/index.ts       # Per-request logger (method, status, duration, IP, body)
    Debug/morganMiddleware.ts  # Morgan HTTP logger → LogService.NETWORK
    AccessLimit/index.ts # Role-based access guard (pass accessRole string[])
    AccessValidation/    # Session validation — stub, implement when auth is built
    Errors/
      globalErrorHandler.ts   # Handles CustomError, ZodError, MulterError, MongooseError
      notFoundHandler.ts      # 404 fallback

  Utils/
    errors/customError.class.ts   # throw new CustomError(message, statusCode)
    helper/
      catchAsync.ts       # Wraps async route handlers, forwards errors to next()
      sendResponse.ts     # sendResponse.success(res, {}) / sendResponse.error(res, {})
      hashHelper.ts       # HashHelper.generateHashPassword / comparePassword (bcryptjs)
      queryOptimize.ts    # calculatePagination, manageSorting, queryOptimization, MongoQueryHelper
      pickFunction.ts     # Pick keys from object
    mail/
      resend.ts           # MailUtils.sendMail (active)
      nodemailer.ts       # Stub — uncomment when SMTP needed
    file/
      config.ts           # Multer diskStorage → temp-uploads/
      upload.ts           # R2 upload/delete/presigned URL helpers + R2BucketUtils class
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

  bootstrap.ts            # initRedisIndex(), refreshRedisCache() — fill as features grow
```

---

## Config

All environment config lives in `src/Config/index.ts` — validated with Zod at startup. If any required variable is missing the process crashes immediately with a clear error.

Copy `.env.example` → `.env` and fill in values before running.

Key config keys used in code:
- `config.port` — server port
- `config.node_env` — `ENodeEnv.DEV` | `ENodeEnv.PROD`
- `config.mongo_uri`
- `config.redis.{host, port, password}`
- `config.jwt.{accessToken, refreshToken}.{secret, exp}`
- `config.mail.{resend_api_key, admin_contact_email}`
- `config.cloudflare_r2.{accountId, accessKeyId, secretAccessKey, bucketName, region, customDomain}`
- `config.frontend.{verify_page_url, reset_page_url}`
- `config.bcrypt_saltRounds`

---

## Adding a feature module

1. Create `src/App/<FeatureName>/` with `controller.ts`, `service.ts`, `model.ts`, `routes.ts`, `types.ts`
2. Register routes in `src/Routes/index.ts`:
   ```ts
   rootRouter.use('/feature-name', featureRoutes)
   ```
3. If the feature needs Redis caching, add index creation to `bootstrap.ts → initRedisIndex()`

---

## Logging

Use `LogService.<SERVICE>` — never `console.log` in application code.

```ts
import { LogService } from '@/Config/logger/utils'

LogService.APPLICATION.info('message')
LogService.APPLICATION.error(new Error('...'))   // accepts Error objects
LogService.DATABASE.warn('slow query', { ms: 200 })
LogService.REDIS.debug('cache hit', { key })
LogService.NETWORK.http('...')
LogService.AUTH.info('user logged in', { userId })
```

Available services: `APPLICATION`, `DATABASE`, `REDIS`, `NETWORK`, `AUTH`, `SYSTEM`

---

## Error handling

Throw `CustomError` anywhere in a route handler — `globalErrorHandler` catches it:

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

The app container is `node:22-alpine`. Redis is `redis:7.4-alpine`. Redis data is persisted in the `redis_data` volume.

---

## Key conventions

- Use `ENodeEnv` enum from `@/Config/utils/config.types` for env checks — never compare against raw strings
- File uploads land in `temp-uploads/` (multer) → immediately moved to Cloudflare R2
- Never import `process.env` directly — always use `config` from `@/Config`
- `sendResponse` automatically cleans up uploaded temp files on both success and error responses
