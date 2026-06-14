import { config } from "dotenv";
import path from "path";
import z from "zod";
import { ENodeEnv } from "./utils/config.types";

config({ path: path.join(process.cwd(), ".env") });

// ── Cookie defaults derived from environment ───────────────────────────────
// sameSite "none" requires secure:true (browsers reject cookies otherwise).
// In production we always use "none" + secure so cross-origin cookies work.
const isProd         = process.env.NODE_ENV === ENodeEnv.PROD;
const cookieSameSite = (process.env.AUTH_COOKIE_SAMESITE ?? (isProd ? "none" : "lax")) as "lax" | "none" | "strict";
const cookieSecure   = process.env.AUTH_COOKIE_SECURE !== undefined
  ? process.env.AUTH_COOKIE_SECURE === "true"
  : cookieSameSite === "none"; // none always requires secure
// Optional cookie domain — set to ".talkhead.ai" (note leading dot) when the
// frontend and backend are on different subdomains of the same registrable domain.
// This allows cookies set by the API (dev-api.talkhead.ai, via the Next.js proxy)
// to be sent by the browser on direct cross-origin connections such as Socket.io.
// Leave unset in local development — localhost needs no domain restriction.
const cookieDomain   = process.env.AUTH_COOKIE_DOMAIN ?? undefined;

// ── Zod-validated config ───────────────────────────────────────────────────
const envConfig = z
  .object({
    appName : z.string(),
    port    : z.number().default(9000),
    node_env: z.enum([ENodeEnv.DEV, ENodeEnv.PROD]).default(ENodeEnv.DEV),

    cors: z.object({
      allowed_origins: z.array(z.string()).default([]),
    }),

    auth: z.object({
      cookie: z.object({
        sameSite: z.enum(["lax", "none", "strict"]),
        secure  : z.boolean(),
        domain  : z.string().optional(),
      }),
    }),

    redis: z.object({
      host    : z.string(),
      port    : z.number().default(6379),
      password: z.string(),
    }),

    mongo_uri        : z.string(),
    bcrypt_saltRounds: z.number(),
    backend_base_url : z.string(),

    jwt: z.object({
      accessToken : z.object({ secret: z.string(), exp: z.string() }),
      refreshToken: z.object({ secret: z.string(), exp: z.string() }),
    }),

    mail: z.object({
      admin_contact_email: z.string(),
      resend_api_key     : z.string(),
    }),

    frontend: z.object({
      reset_page_url       : z.string(),
      verify_page_url      : z.string(),
      social_callback_url  : z.string().optional(), // required only when Google OAuth is configured
    }),

    // Optional — only needed if Google OAuth is implemented
    google: z.object({
      client_id    : z.string(),
      client_secret: z.string(),
    }).optional(),

    cloudflare_r2: z.object({
      accountId      : z.string(),
      accessKeyId    : z.string(),
      secretAccessKey: z.string(),
      bucketName     : z.string(),
      region         : z.string().default("auto"),
      customDomain   : z.string().optional(),
    }),

    application_log_config: z.object({
      log_level       : z.enum(["debug", "info", "warn", "error", "silly"]).default("debug"),
      error_logs_level: z.enum(["error", "silly"]).default("error"),
      log_dir         : z.string().default("../application-logs"),
      max_files       : z.string().default("15d"),
      max_size        : z.string().default("20m"),
    }),

    queue: z.object({
      name          : z.string().default("main-queue"),
      api_key       : z.string(),                        // API key for external team
      external_api_url: z.string(),                      // other team's backend URL
      concurrency   : z.number().default(1),             // jobs processed at a time
    }),


    // Rate limiting — windowMs in ms, max = allowed requests per window per key
    rate_limit: z.object({
      global: z.object({ windowMs: z.number(), max: z.number() }), // blanket /api/v1
      auth  : z.object({ windowMs: z.number(), max: z.number() }), // login brute-force
      email : z.object({ windowMs: z.number(), max: z.number() }), // email-send abuse
    }),
  })
  .parse({
    appName : process.env.APP_NAME,
    port    : process.env.PORT ? parseInt(process.env.PORT) : 9000,
    node_env: process.env.NODE_ENV,

    cors: {
      allowed_origins: process.env.CORS_ALLOWED_ORIGINS
        ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean)
        : [],
    },

    auth: {
      cookie: { sameSite: cookieSameSite, secure: cookieSecure, domain: cookieDomain },
    },

    redis: {
      host    : process.env.REDIS_HOST,
      port    : process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
      password: process.env.REDIS_PASSWORD,
    },

    mongo_uri        : process.env.MONGO_URI,
    bcrypt_saltRounds: process.env.BCRYPT_SALT_ROUNDS ? parseInt(process.env.BCRYPT_SALT_ROUNDS) : 12,
    backend_base_url : process.env.BACKEND_BASE_URL,

    jwt: {
      accessToken : { secret: process.env.JWT_ACCESS_TOKEN_SECRET,  exp: process.env.JWT_ACCESS_TOKEN_EXPIRE_IN  },
      refreshToken: { secret: process.env.JWT_REFRESH_TOKEN_SECRET, exp: process.env.JWT_REFRESH_TOKEN_EXPIRE_IN },
    },

    mail: {
      admin_contact_email: process.env.ADMIN_CONTACT_EMAIL,
      resend_api_key     : process.env.RESEND_API_KEY,
    },

    frontend: {
      reset_page_url      : process.env.FRONTEND_RESET_PAGE_URL,
      verify_page_url     : process.env.FRONTEND_VERIFY_PAGE_URL,
      social_callback_url : process.env.FRONTEND_SOCIAL_CALLBACK_URL,
    },

    google: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET }
      : undefined,

    cloudflare_r2: {
      accountId      : process.env.CLOUDFLARE_ACCOUNT_ID,
      accessKeyId    : process.env.CLOUDFLARE_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
      bucketName     : process.env.CLOUDFLARE_BUCKET_NAME,
      region         : process.env.CLOUDFLARE_REGION || "auto",
      customDomain   : process.env.CLOUDFLARE_CUSTOM_DOMAIN,
    },

    application_log_config: {
      log_level       : process.env.APPLICATION_LOG_LEVEL        || "debug",
      error_logs_level: process.env.APPLICATION_LOG_ERROR_LEVEL  || "error",
      log_dir         : process.env.APPLICATION_LOG_DIR          || "../application-logs",
      max_files       : process.env.APPLICATION_LOG_MAX_FILES    || "15d",
      max_size        : process.env.APPLICATION_LOG_MAX_SIZE     || "20m",
    },

    queue: {
      name            : process.env.QUEUE_NAME          || "main-queue",
      api_key         : process.env.QUEUE_API_KEY,
      external_api_url: process.env.QUEUE_EXTERNAL_API_URL,
      concurrency     : process.env.QUEUE_CONCURRENCY ? parseInt(process.env.QUEUE_CONCURRENCY) : 1,
    },


    rate_limit: {
      global: {
        windowMs: process.env.RATE_LIMIT_GLOBAL_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS) : 15 * 60 * 1000,
        max     : process.env.RATE_LIMIT_GLOBAL_MAX       ? parseInt(process.env.RATE_LIMIT_GLOBAL_MAX)       : 300,
      },
      auth: {
        windowMs: process.env.RATE_LIMIT_AUTH_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS) : 15 * 60 * 1000,
        max     : process.env.RATE_LIMIT_AUTH_MAX       ? parseInt(process.env.RATE_LIMIT_AUTH_MAX)       : 10,
      },
      email: {
        windowMs: process.env.RATE_LIMIT_EMAIL_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_EMAIL_WINDOW_MS) : 60 * 60 * 1000,
        max     : process.env.RATE_LIMIT_EMAIL_MAX       ? parseInt(process.env.RATE_LIMIT_EMAIL_MAX)       : 5,
      },
    },
  });

export default envConfig;
