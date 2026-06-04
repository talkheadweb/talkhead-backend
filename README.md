# talkhead-backend

Production-ready Node.js REST API backend starter.

**Stack:** Express · TypeScript · MongoDB · Redis · Zod · Winston · Cloudflare R2 · Docker · pnpm

---

## Prerequisites

- Node.js 22+
- pnpm 10+
- MongoDB instance
- Redis instance

---

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment variables
cp .env.example .env
# Fill in your values in .env

# 3. Start development server
pnpm dev
```

---

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot-reload |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled production build |

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Description |
|---|---|---|
| `APP_NAME` | Yes | Application name |
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | Server port (default: 9000) |
| `BACKEND_BASE_URL` | Yes | Base URL of this server |
| `MONGO_URI` | Yes | MongoDB connection string |
| `REDIS_HOST` | Yes | Redis host |
| `REDIS_PORT` | No | Redis port (default: 6379) |
| `REDIS_PASSWORD` | Yes | Redis password |
| `JWT_ACCESS_TOKEN_SECRET` | Yes | JWT access token signing secret |
| `JWT_REFRESH_TOKEN_SECRET` | Yes | JWT refresh token signing secret |
| `JWT_ACCESS_TOKEN_EXPIRE_IN` | Yes | Access token expiry (e.g. `15m`) |
| `JWT_REFRESH_TOKEN_EXPIRE_IN` | Yes | Refresh token expiry (e.g. `7d`) |
| `BCRYPT_SALT_ROUNDS` | No | Bcrypt rounds (default: 12) |
| `ADMIN_CONTACT_EMAIL` | Yes | Admin email address |
| `RESEND_API_KEY` | Yes | Resend API key for transactional email |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `CLOUDFLARE_ACCESS_KEY_ID` | Yes | R2 access key ID |
| `CLOUDFLARE_SECRET_ACCESS_KEY` | Yes | R2 secret access key |
| `CLOUDFLARE_BUCKET_NAME` | Yes | R2 bucket name |
| `CLOUDFLARE_REGION` | No | R2 region (default: `auto`) |
| `CLOUDFLARE_CUSTOM_DOMAIN` | No | Custom domain for R2 bucket |
| `FRONTEND_VERIFY_PAGE_URL` | Yes | Email verification page URL |
| `FRONTEND_RESET_PAGE_URL` | Yes | Password reset page URL |

---

## Project structure

```
src/
  Config/           # Env config (Zod), MongoDB, Redis, Logger
  Middlewares/      # Debug logger, error handlers, access guards
  Routes/           # Route registration
  Utils/            # Shared utilities
    errors/         # CustomError class
    helper/         # catchAsync, sendResponse, hash, pagination
    file/           # Multer config, Cloudflare R2 upload utilities
    mail/           # Resend email utility
    redis/          # RedisJSON and RedisSearch service wrappers
    validation/     # Zod and Mongoose error normalizers
    CodeGenerator/  # Unique code/token generator
    types/          # Shared TypeScript types
  bootstrap.ts      # Startup tasks (Redis index init, cache warm-up)
  app.ts            # Express app setup
  index.ts          # Server entry point
```

---

## Running with Docker

```bash
# Start app + Redis
docker compose up --build

# Stop and remove volumes
docker compose down -v
```

The app runs on port `9000`. Redis data is persisted in the `redis_data` Docker volume.

---

## API

### Health check

```
GET /health
→ 200 "Healthy"
```

### Feature routes

All feature routes are mounted under `/api/v1` in `src/Routes/index.ts`.

---

## Adding a feature module

1. Create `src/App/<FeatureName>/` with `routes.ts`, `controller.ts`, `service.ts`, `model.ts`, `types.ts`
2. Register in `src/Routes/index.ts`:

```ts
rootRouter.use('/users', userRoutes)
```

3. If the feature uses Redis caching, register its index in `src/bootstrap.ts → initRedisIndex()`

---

## Key utilities

### Error handling

```ts
import CustomError from '@/Utils/errors/customError.class'
import catchAsync from '@/Utils/helper/catchAsync'

const handler = catchAsync(async (req, res, next) => {
  throw new CustomError('Not found', 404)
})
```

### Sending responses

```ts
import { sendResponse } from '@/Utils/helper/sendResponse'

sendResponse.success(res, { statusCode: 200, message: 'OK', data, req })
sendResponse.error(res, { statusCode: 400, message: 'Bad request', req })
```

### Logging

```ts
import { LogService } from '@/Config/logger/utils'

LogService.APPLICATION.info('Server started')
LogService.APPLICATION.error(new Error('Something failed'))
LogService.DATABASE.warn('Slow query', { ms: 350 })
LogService.AUTH.info('User logged in', { userId })
```

Services: `APPLICATION` · `DATABASE` · `REDIS` · `NETWORK` · `AUTH` · `SYSTEM`

### Password hashing

```ts
import { HashHelper } from '@/Utils/helper/hashHelper'

const hash = await HashHelper.generateHashPassword(plainPassword)
const match = await HashHelper.comparePassword(plainPassword, hash)
```

### File upload to Cloudflare R2

```ts
import { upload } from '@/Utils/file/config'               // multer middleware
import { uploadProfileImageToR2, getPresignedUrl } from '@/Utils/file/upload'

// In route:
router.post('/avatar', upload.single('image'), handler)

// In handler:
const { fileKey, fileUrl } = await uploadProfileImageToR2(req.file.path, req.file.originalname)
const signedUrl = await getPresignedUrl(fileKey, 3600)
```

### Email (Resend)

```ts
import { MailUtils } from '@/Utils/mail/resend'

await MailUtils.sendMail({
  from: 'noreply@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome',
  html: '<p>Hello</p>',
})
```

### Code / token generation

```ts
import { CodeGeneratorUtils } from '@/Utils/CodeGenerator'
import { ECodeGeneratorCharset } from '@/Utils/CodeGenerator/types'

const [otp] = CodeGeneratorUtils.generate({
  charset: ECodeGeneratorCharset.NUMBERS,
  length: 6,
  count: 1,
})
```

### Redis JSON cache

```ts
import { RedisJSON } from '@/Utils/redis'

await RedisJSON.setJSON('user:123', { name: 'Alice' }, 3600)
const user = await RedisJSON.getJSON<User>('user:123')
await RedisJSON.deleteKey('user:123')
```

### Pagination helpers

```ts
import { calculatePagination, manageSorting } from '@/Utils/helper/queryOptimize'

const { page, limit, skip } = calculatePagination(req.query)
const { sortBy, sortOrder } = manageSorting(req.query)
```
