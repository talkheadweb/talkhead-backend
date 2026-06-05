# Conventions

Consistency rules the codebase. Every pattern below has a reason — follow it
and the codebase stays uniform no matter how many people work on it.

---

## Module structure

Every feature lives in `src/App/<FeatureName>/` and follows this exact layout:

```
FeatureName/
  controller.ts    Request/response only — no business logic
  service.ts       All business logic — no req/res objects
  model.ts         Mongoose schema + model
  routes.ts        Route definitions
  validation.ts    Zod schemas (single source of truth for request shapes)
  types.ts         TypeScript interfaces, enums, DTOs
  const.ts         Constants (if needed)
  utils.ts         Pure helper functions specific to this module
  <feature>.swagger.ts   OpenAPI path definitions
```

Subfolders (like `social/`) are fine when a feature has a meaningfully different
sub-flow that shouldn't pollute the parent module.

---

## Path aliases

`@/` maps to `src/`. Always use aliases — never use relative paths like `../../Config`.

```ts
// Good
import config from "@/Config";
import CustomError from "@/Utils/errors/customError.class";

// Bad
import config from "../../Config";
```

---

## Environment config

Never read `process.env` directly. Always use the `config` object:

```ts
import config from "@/Config";

// Good
const port = config.port;
const isProd = config.node_env === ENodeEnv.PROD;

// Bad
const port = process.env.PORT;
```

`src/Config/index.ts` is Zod-validated at startup. If any required variable is
missing the process crashes immediately with a clear message.

---

## Controllers

Controllers handle only the HTTP layer: read from `req`, call service, write to `res`.
Business logic belongs in the service.

```ts
// Good
const login = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as TLoginBody;
  const result = await AuthService.login({ email: body.email, password: body.password });
  res.cookie(COOKIE_NAME, result.refreshToken, cookieOptions);
  sendResponse.success(res, { statusCode: 200, message: "Login successful.", data: result, req });
});

// Bad — business logic inside controller
const login = catchAsync(async (req: Request, res: Response) => {
  const user = await UserModel.findOne({ email: req.body.email });
  if (!user) throw new CustomError("Invalid credentials.", 401);
  // ...
});
```

Always wrap async handlers with `catchAsync` — it forwards thrown errors to
`globalErrorHandler` without try/catch boilerplate.

---

## Services

Services contain all business logic. They never import `req` or `res`. They
throw `CustomError` for expected errors and let unexpected errors bubble.

```ts
const login = async (payload: TLoginInput): Promise<TLoginResponse> => {
  const user = await UserModel.findOne({ email: payload.email }).select("+password");
  if (!user) throw new CustomError("Invalid email or password.", 401);
  // ...
  return { user: toPublicUser(user), accessToken, refreshToken };
};
```

---

## Error handling

```ts
import CustomError from "@/Utils/errors/customError.class";

throw new CustomError("Not found.", 404);
throw new CustomError("Email already exists.", 409);
throw new CustomError("Forbidden.", 403);
```

`globalErrorHandler` in `src/Middlewares/Errors/globalErrorHandler.ts` handles:
- `CustomError` → uses its statusCode + message
- `ZodError` → 400 with field-level messages
- `MulterError` → 400
- `MongooseError` → 400 (duplicate key, validation, cast errors)
- Anything else → 500 "Internal server error."

**5xx errors are logged as `.error`, 4xx as `.warn`.** Never swallow errors silently
unless the business rule explicitly requires it (e.g. email enumeration prevention).

---

## Sending responses

Always use `sendResponse` — never `res.json()` directly.

```ts
import { sendResponse } from "@/Utils/helper/sendResponse";

// Success with data
sendResponse.success(res, {
  statusCode: 200,
  message   : "User fetched.",
  data      : user,
  req,
});

// Success with pagination
sendResponse.success(res, {
  statusCode: 200,
  message   : "Users fetched.",
  data      : users,
  meta      : { page, limit, total },
  req,
});

// Created (no data)
sendResponse.success(res, {
  statusCode: 201,
  message   : "Account created.",
  req,
});
```

`sendResponse` automatically cleans up any uploaded temp files from `req.file`
on both success and error responses.

---

## Logging

Never use `console.log` in application code. Use `LogService`:

```ts
import { LogService } from "@/Config/logger/utils";

const log = LogService.APPLICATION; // pick the right service once at top of file

log.info("User registered", { userId: user._id });
log.warn("Rate limit approaching", { ip: req.ip });
log.error("Database error", err);
log.debug("Cache hit", { key });
```

| Service | Use for |
|---|---|
| `APPLICATION` | General app logic |
| `AUTH` | Login, logout, token events |
| `DATABASE` | Mongoose queries, slow queries |
| `REDIS` | Cache hits/misses, key operations |
| `NETWORK` | HTTP requests (Morgan uses this automatically) |
| `SYSTEM` | Startup, shutdown, OS-level events |

Logs are written to `../application-logs/` (configurable via `APPLICATION_LOG_DIR`).
Files rotate daily. Errors go to a separate file.

---

## Validation

Zod schemas in `validation.ts` are the single source of truth for request body
shapes. TypeScript types are derived from them — never written by hand.

```ts
// validation.ts
const registerZodSchema = z.object({
  body: z.object({
    name    : z.string().min(2).max(50),
    email   : z.string().email(),
    password: z.string().min(8).max(128),
  }),
});

// types.ts — derived, not duplicated
export type TRegisterBody = z.infer<typeof AuthValidation.registerZodSchema>["body"];
```

Apply validation with the `validateRequest` middleware:

```ts
router.post("/register", validateRequest(AuthValidation.registerZodSchema), controller)
```

---

## Authentication in routes

```ts
import authenticate from "@/Middlewares/Auth";
import { AccessLimit } from "@/Middlewares/AccessLimit";

// Public
router.post("/login", loginLimiter, validateRequest(schema), controller)

// Authenticated
router.get("/me", authenticate, controller)
// Access userId: req.user!.uid

// Admin only
router.delete("/users/:id", authenticate, AccessLimit(["admin"]), controller)
```

Never read `req.headers["uid"]` or any custom headers for identity.
`req.user.uid` is set by `authenticate` after token verification and is the only
trusted source of the current user's identity.

---

## MongoDB models

```ts
// Always use ENodeEnv-style enums for string fields
enum EUserRole { USER = "user", ADMIN = "admin" }

// Use required + trim + lowercase on string fields consistently
email: { type: String, required: true, unique: true, lowercase: true, trim: true }

// Use select: false for sensitive fields
password: { type: String, select: false }

// Use sparse: true for optional unique fields (allows multiple nulls)
googleId: { type: String, unique: true, sparse: true }

// Always use versionKey: false unless you need optimistic concurrency
{ timestamps: true, versionKey: false }
```

Use `HydratedDocument<IUser>` when typing Mongoose documents, not `any`:
```ts
import { HydratedDocument } from "mongoose";
const toPublicUser = (user: HydratedDocument<IUser>): TUserPublic => { ... }
```

---

## Rate limiting

```ts
import { globalLimiter, loginLimiter, emailLimiter, createRateLimiter } from "@/Middlewares/RateLimit";

// Blanket — applied automatically to all /api/v1 routes
globalLimiter  // 300 req / 15 min per IP

// Login brute-force
router.post("/login", loginLimiter, ...)   // 10 attempts / 15 min per IP

// Email routes (composite IP+email key)
router.post("/register",            emailLimiter, ...)   // 5 req / 1 hr
router.post("/forgot-password",     emailLimiter, ...)
router.post("/resend-verification", emailLimiter, ...)

// Custom limiter
const myLimiter = createRateLimiter({ windowMs: 60_000, max: 20, prefix: "rl:my:", message: "..." });
```

---

## Swagger / OpenAPI

Each module owns its OpenAPI definitions in `<module>.swagger.ts`, colocated with
its routes. The central file `src/Config/swagger/index.ts` assembles them.

Use the builder DSL from `src/Config/swagger/helpers.ts`. Read the legend comment
at the top of that file once — every path file will then read like plain English.

When adding a new endpoint, update the module's swagger file in the same commit.

---

## File uploads

```ts
import { upload } from "@/Utils/file/config";           // multer middleware
import { uploadProfileImageToR2 } from "@/Utils/file/upload";

// Route
router.patch("/profile", authenticate, upload.single("profilePicture"), controller);

// Controller / service
const { fileUrl } = await uploadProfileImageToR2(file.path, file.originalname);
// file.path = temp-uploads/ path set by multer
// fileUrl   = https://cdn.example.com/key  OR  fileKey for presigned URL generation
```

Upload new file first, then delete old one — never the reverse. If the upload
fails, the user's current file remains intact.

`sendResponse` cleans up `temp-uploads/` on every response (success and error).

---

## Docker / environment checks

```ts
import { ENodeEnv } from "@/Config/utils/config.types";
import config from "@/Config";

// Good
if (config.node_env === ENodeEnv.PROD) { ... }

// Bad — never compare raw strings
if (process.env.NODE_ENV === "production") { ... }
```
