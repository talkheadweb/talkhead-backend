# Architecture

## Overview

Talkhead Backend is a stateless REST API. Every request is authenticated via a short-lived JWT access token. Longer-lived refresh tokens are stored in Redis so they can be revoked instantly.

```
Client
  │
  ▼
Express app (app.ts)
  ├─ Social OAuth routes   /api/v1/auth/social/*   (browser-redirect flow)
  └─ JSON API routes       /api/v1/*               (standard REST)
       ├─ globalLimiter    (Redis-backed rate limit)
       ├─ debugMiddleware  (per-request logging)
       ├─ Auth routes      /api/v1/auth/*
       └─ Feature routes   /api/v1/<feature>/*
```

---

## Startup sequence (`src/index.ts`)

```
1. connectDB()       MongoDB connects — app won't start without it
2. bootstrap()       cleanupTempFiles · initRedisIndex · refreshRedisCache
3. server.listen()   HTTP server opens for traffic last
```

`src/app.ts` is a pure Express factory — no DB, no Redis, no side effects.
All startup logic lives in `src/index.ts`.

---

## Folder structure

```
src/
├── App/                          Feature modules
│   └── Auth/                     Authentication module
│       ├── controller.ts         Request / response (email/password)
│       ├── service.ts            Business logic (email/password)
│       ├── model.ts              Mongoose User schema
│       ├── routes.ts             Route definitions (email/password)
│       ├── validation.ts         Zod request schemas
│       ├── types.ts              IUser, TUserPublic, DTOs
│       ├── const.ts              Redis TTLs, cookie options
│       ├── utils.ts              toPublicUser, email templates
│       ├── redisService.ts       Redis token storage helpers
│       ├── auth.swagger.ts       OpenAPI path definitions
│       └── social/               Social / OAuth login sub-module
│           ├── controller.ts     OAuth request handlers
│           ├── service.ts        find-or-create user logic
│           ├── routes.ts         OAuth route definitions
│           ├── types.ts          TSocialLoginInput
│           └── strategies/
│               └── google.strategy.ts   Passport Google strategy
│
├── Config/
│   ├── index.ts                  Zod-validated env config (single source of truth)
│   ├── db.ts                     Mongoose connection + event logging
│   ├── redis/
│   │   ├── connection.ts         Main Redis client (RedisClient)
│   │   └── events.ts             Pub/sub client (RedisEventClient)
│   ├── logger/
│   │   ├── index.ts              CustomLogger class
│   │   ├── utils.ts              baseLogger + LogService export
│   │   └── types.ts              ServiceList enum
│   ├── swagger/
│   │   ├── helpers.ts            Builder DSL for OpenAPI specs
│   │   └── index.ts              OpenAPI spec assembly
│   └── utils/
│       └── config.types.ts       ENodeEnv enum
│
├── Middlewares/
│   ├── Auth/index.ts             authenticate — validates Bearer token, sets req.user
│   ├── AccessLimit/index.ts      AccessLimit(["admin"]) — role guard
│   ├── RateLimit/index.ts        createRateLimiter factory + presets
│   ├── validateRequest/index.ts  validateRequest(zodSchema)
│   ├── Debug/
│   │   ├── index.ts              Per-request logger (method, status, duration, IP)
│   │   └── morganMiddleware.ts   HTTP access log → LogService.NETWORK
│   └── Errors/
│       ├── globalErrorHandler.ts Handles CustomError, ZodError, MulterError, MongooseError
│       └── notFoundHandler.ts    404 fallback
│
├── Routes/
│   ├── config.ts                 Mounts globalLimiter + debugMiddleware + rootRouter at /api/v1
│   └── index.ts                  rootRouter — add feature routes here
│
├── Utils/
│   ├── errors/customError.class.ts   throw new CustomError(message, statusCode)
│   ├── helper/
│   │   ├── catchAsync.ts         Wraps async handlers, forwards errors
│   │   ├── sendResponse.ts       sendResponse.success / .error
│   │   ├── hashHelper.ts         bcryptjs hash + compare
│   │   ├── queryOptimize.ts      Pagination, sorting, MongoDB filter helpers
│   │   ├── jwtHelper.ts          JwtHelper.sign/verify for access + refresh tokens
│   │   └── pickFunction.ts       Pick keys from an object
│   ├── mail/resend.ts            MailUtils.sendMail (Resend)
│   ├── file/
│   │   ├── config.ts             Multer diskStorage → temp-uploads/
│   │   ├── upload.ts             R2 upload / delete / presigned URL
│   │   └── type.ts               R2Config, allowedMimes
│   ├── redis/
│   │   ├── index.ts              Re-exports RedisJSON, RedisSearch
│   │   ├── services/
│   │   │   ├── json.service.ts   JSON.SET / GET / MGET / DEL / SCAN
│   │   │   └── search.service.ts FT.CREATE / SEARCH
│   │   ├── logic/query.ts        buildQuery — tag / text / numeric filter builder
│   │   └── types.ts              Condition, SearchOptions, SearchResult, SchemaField
│   ├── validation/
│   │   ├── zod.validation.ts     processZodValidation.errorValidation
│   │   └── mongoose.validation.ts processMongooseValidationError, isValidMongoID
│   ├── CodeGenerator/
│   │   ├── index.ts              CodeGeneratorUtils.generate / generateOne
│   │   └── types.ts              ECodeGeneratorCharset, TCodeGeneratorConfig
│   └── types/
│       ├── errors.type.ts        TGenericErrorMessages
│       ├── response.type.ts      TCustomErrorResponse, TGenericSuccessMessages
│       ├── query.type.ts         TPaginationOptions, TSortOptions, TMeta
│       └── jwtHelper.type.ts     CustomJwtPayload (uid, email, role)
│
├── types/
│   └── express/index.d.ts        Augments Express.User with uid, email, role
│
├── app.ts                        Express app factory
├── bootstrap.ts                  Startup tasks
└── index.ts                      Entry point + graceful shutdown
```

---

## Request lifecycle (JSON API)

```
Incoming request
       │
       ▼
morganMiddleware         HTTP access log
       │
       ▼
express.json()           Parse body
cookieParser()           Parse cookies
passport.initialize()    Initialize passport (stateless, no sessions)
CORS                     Origin check
       │
       ▼
[Social OAuth requests end here → /api/v1/auth/social/*]
       │
       ▼
globalLimiter            Rate limit (Redis-backed, per IP)
debugMiddleware          Log method / path / IP / body
       │
       ▼
Feature router           e.g. /api/v1/auth/login
       │
       ├── [loginLimiter]          Optional route-level limiter
       ├── [authenticate]          JWT verification → req.user
       ├── [AccessLimit(roles)]    Role guard
       ├── validateRequest(schema) Zod body validation
       └── controller              Business logic via service
                │
                ▼
         sendResponse.success()    Consistent JSON response shape
                │
                ▼
         [Error thrown?]
                │
                ▼
         globalErrorHandler        Normalises all errors to standard shape
```

---

## Response shape

Every response (success and error) uses the same envelope:

```jsonc
// Success
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful.",
  "data": { ... },       // present when there is data to return
  "meta": { ... }        // present for paginated responses
}

// Error
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed.",
  "errorMessages": [
    { "path": "body.email", "message": "Please provide a valid email address." }
  ]
}
```

---

## Data stores

| Store | What it holds |
|---|---|
| **MongoDB** | All persistent data (users, future features) |
| **Redis** | Refresh tokens · Verify tokens · Reset tokens · Rate-limit counters · Optional feature caches |

Redis keys follow the pattern `<prefix>:<userId>`:
- `auth:refresh:<userId>` — refresh token (7 day TTL)
- `auth:verify:<userId>` — email verification token (24 hour TTL)
- `auth:reset:<userId>` — password reset token (1 hour TTL)

---

## Security model

| Concern | How it's handled |
|---|---|
| Password storage | bcrypt, 12 rounds minimum |
| Access tokens | Short-lived JWT (15 min), signed with secret |
| Refresh tokens | Long-lived JWT (7 days), stored in Redis — can be revoked instantly |
| Role elevation | `role` field stripped at registration; only admin can promote |
| Email enumeration | `forgotPassword` and `resendVerification` return silently for unknown emails |
| Brute force | `loginLimiter` (10 attempts / 15 min per IP) |
| CORS | Fail-closed: all cross-origin requests denied unless origin is in `CORS_ALLOWED_ORIGINS` |
| File uploads | Land in `temp-uploads/` → moved to R2 → temp file cleaned up in `sendResponse` |
| Password reset | Revokes the active refresh token so stolen sessions are invalidated |
| Social accounts | Account merging by email; social-only accounts have no password field |
