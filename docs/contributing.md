# Contributing

---

## Getting started

```bash
git clone <repo-url>
cd talkhead-backend
pnpm install
cp .env.example .env   # fill in values — see docs/deployment.md
pnpm dev               # hot-reload dev server on :9000
```

Run tests before any commit:

```bash
pnpm test              # all tests
pnpm test:watch        # watch mode while developing
pnpm test:coverage     # coverage report
```

---

## Adding a feature module

A feature is a self-contained folder under `src/App/<FeatureName>/`.

### 1. Create the module folder

```
src/App/Post/
  controller.ts
  service.ts
  model.ts
  routes.ts
  validation.ts
  types.ts
  post.swagger.ts
```

Minimal working example — `Post` module:

**`model.ts`**
```ts
import { model, Schema } from "mongoose";
import { IPost } from "./types";

const PostSchema = new Schema<IPost>(
  {
    title  : { type: String, required: true, trim: true },
    body   : { type: String, required: true },
    author : { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false },
);

export default model<IPost>("Post", PostSchema);
```

**`types.ts`**
```ts
import { Types } from "mongoose";

export interface IPost {
  _id   : Types.ObjectId;
  title : string;
  body  : string;
  author: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
```

**`validation.ts`**
```ts
import { z } from "zod";

const createPostSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    body : z.string().min(1),
  }),
});

export const PostValidation = { createPostSchema };
```

**`service.ts`**
```ts
import CustomError from "@/Utils/errors/customError.class";
import PostModel from "./model";
import { IPost } from "./types";

const create = async (authorId: string, title: string, body: string): Promise<IPost> => {
  return PostModel.create({ title, body, author: authorId });
};

const findById = async (id: string): Promise<IPost> => {
  const post = await PostModel.findById(id);
  if (!post) throw new CustomError("Post not found.", 404);
  return post;
};

export const PostService = { create, findById };
```

**`controller.ts`**
```ts
import catchAsync from "@/Utils/helper/catchAsync";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { Request, Response } from "express";
import { PostService } from "./service";

const create = catchAsync(async (req: Request, res: Response) => {
  const post = await PostService.create(req.user!.uid, req.body.title, req.body.body);
  sendResponse.success(res, { statusCode: 201, message: "Post created.", data: post, req });
});

export const PostController = { create };
```

**`routes.ts`**
```ts
import authenticate from "@/Middlewares/Auth";
import validateRequest from "@/Middlewares/validateRequest";
import { Router } from "express";
import { PostController } from "./controller";
import { PostValidation } from "./validation";

const postRouter = Router();

postRouter
  .post("/", authenticate, validateRequest(PostValidation.createPostSchema), PostController.create);

export default postRouter;
```

### 2. Register the routes

`src/Routes/index.ts`:
```ts
import postRouter from "@/App/Post/routes";

rootRouter.use("/posts", postRouter);
// → POST /api/v1/posts
```

### 3. Register Swagger

`src/Config/swagger/index.ts`:
```ts
import { postPaths } from "@/App/Post/post.swagger";

// In paths:
paths: { ...authPaths, ...postPaths }

// In tags:
tags: [
  { name: "Auth", description: "Authentication" },
  { name: "Post", description: "Post management" },
]
```

### 4. Write tests

```
__tests__/Post/
  create.test.ts
  findById.test.ts
```

Follow the pattern in `__tests__/Auth/` — one file per endpoint, mock the
model, test success + validation + error cases.

### 5. (Optional) Redis cache

If the feature needs caching, add index creation to `src/bootstrap.ts`:
```ts
const initRedisIndex = async (): Promise<void> => {
  await RedisSearch.createIndex({ ... });  // your index here
};
```

---

## Adding a social login provider (e.g. GitHub)

1. **Install passport strategy**
   ```bash
   pnpm add passport-github2 && pnpm add -D @types/passport-github2
   ```

2. **Add env vars** to `.env` + `.env.example`:
   ```
   GITHUB_CLIENT_ID=your-github-client-id
   GITHUB_CLIENT_SECRET=your-github-client-secret
   ```

3. **Add config block** to `src/Config/index.ts`:
   ```ts
   github: z.object({
     client_id    : z.string(),
     client_secret: z.string(),
   }).optional(),
   ```
   And in the parse block:
   ```ts
   github: process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
     ? { client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET }
     : undefined,
   ```

4. **Add model field** to `src/App/Auth/model.ts`:
   ```ts
   githubId: { type: String, unique: true, sparse: true },
   ```
   And to `src/App/Auth/types.ts`:
   ```ts
   githubId?: string;
   ```

5. **Create the strategy** `src/App/Auth/social/strategies/github.strategy.ts`:
   ```ts
   import passport from "passport";
   import { Strategy as GithubStrategy } from "passport-github2";
   import config from "@/Config";
   import { SocialAuthService } from "../service";

   if (config.github) {
     passport.use(new GithubStrategy({
       clientID    : config.github.client_id,
       clientSecret: config.github.client_secret,
       callbackURL : `${config.backend_base_url}/api/v1/auth/social/github/callback`,
       scope       : ["user:email"],
     }, async (_at, _rt, profile, done) => {
       try {
         const { user, accessToken, refreshToken } = await SocialAuthService.socialLogin({
           provider  : "github",
           providerId: profile.id,
           email     : profile.emails?.[0]?.value ?? "",
           name      : profile.displayName ?? profile.username,
           picture   : profile.photos?.[0]?.value,
         });
         done(null, { uid: user._id.toString(), email: user.email, role: user.role, accessToken, refreshToken });
       } catch (err) { done(err as Error); }
     }));
   }
   ```

6. **Import the strategy** in `src/app.ts`:
   ```ts
   import "@/App/Auth/social/strategies/github.strategy";
   ```

7. **Add controllers** to `src/App/Auth/social/controller.ts`:
   ```ts
   const githubAuth = (req, res, next) => {
     if (!config.github) { next(new CustomError("GitHub OAuth not configured.", 501)); return; }
     passport.authenticate("github", { session: false })(req, res, next);
   };
   const githubCallback = (req, res, next) => {
     passport.authenticate("github", { session: false }, (err, oauthUser) => {
       if (err || !oauthUser) { redirectToFrontend(res, { error: err?.message ?? "GitHub auth failed." }); return; }
       res.cookie(COOKIE_NAME, oauthUser.refreshToken!, cookieOptions);
       redirectToFrontend(res, { token: oauthUser.accessToken! });
     })(req, res, next);
   };
   // Add to SocialAuthController export: githubAuth, githubCallback
   ```

8. **Add `"github"` to the provider union** in `src/App/Auth/social/types.ts`:
   ```ts
   provider: "google" | "github";
   ```

9. **Uncomment the GitHub section** in `src/App/Auth/social/routes.ts`.

10. **Register the callback URL** in the GitHub OAuth app settings:
    `{BACKEND_BASE_URL}/api/v1/auth/social/github/callback`

---

## Running tests

```bash
pnpm test                     # full suite
pnpm test -- --testPathPattern Auth/login   # single file
pnpm test:coverage            # with coverage
```

Tests use:
- `supertest` for HTTP-level testing
- Jest mocks for MongoDB models, Redis, mail, file uploads
- `jest.setup.ts` sets all required env vars so the Zod config passes

Mock helpers:
- `__tests__/_mocks/loggerUtils.ts` — silences Winston output
- `__tests__/_mocks/redisConnection.ts` — prevents real Redis connections

Write one test file per endpoint. Cover:
1. Happy path — correct input, expected response
2. Validation error — missing / invalid fields
3. Auth error — missing token, wrong role
4. Business error — duplicate email, not found, etc.

---

## Commit style

```
feat: add post module with CRUD endpoints
fix: prevent refresh token reuse after password reset
chore: bump express to 4.19
docs: add social login flow diagram
test: add post creation test
```

Run `pnpm build && pnpm test` before pushing. A broken build or failing test
should never land on `main`.
