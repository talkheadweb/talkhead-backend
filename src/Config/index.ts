import { config } from "dotenv";
import path from "path";
import z from "zod";
import { ENodeEnv } from "./utils/config.types";

config({
  path: path.join(process.cwd(), ".env"),
});

const envConfig = z
  .object({
    appName: z.string(),
    port: z.number().default(9000),
    node_env: z.enum([ENodeEnv.DEV, ENodeEnv.PROD]).default(ENodeEnv.DEV),
    cors: z.object({
      allowed_origins: z.array(z.string()).default([]),
    }),
    auth: z.object({
      cookie: z.object({
        sameSite: z.enum(["lax", "none", "strict"]),
        secure: z.boolean(),
      }),
    }),
    redis: z.object({
      host: z.string(),
      port: z.number().default(6379),
      password: z.string(),
    }),
    mongo_uri: z.string(),
    bcrypt_saltRounds: z.number(),
    jwt: z.object({
      accessToken: z.object({
        secret: z.string(),
        exp: z.string(),
      }),
      refreshToken: z.object({
        secret: z.string(),
        exp: z.string(),
      }),
    }),
    mail: z.object({
      admin_contact_email: z.string(),
      resend_api_key: z.string(),
      nodemailer: z.object({
        host: z.string(),
        port: z.number(),
        secure: z.boolean(),
        user: z.string(),
        pass: z.string(),
      }).optional(),
    }),
    frontend: z.object({
      reset_page_url: z.string(),
      verify_page_url: z.string(),
    }),
    google: z.object({
      client_id: z.string(),
      client_secret: z.string(),
    }).optional(),
    backend_base_url: z.string(),
    cloudflare_r2: z.object({
      accountId: z.string(),
      accessKeyId: z.string(),
      secretAccessKey: z.string(),
      bucketName: z.string(),
      region: z.string().default("auto"),
      customDomain: z.string().optional(),
    }),
    application_log_config: z.object({
      log_level: z
        .enum(["debug", "info", "warn", "error", "silly"])
        .default("debug"),
      error_logs_level: z.enum(["error", "silly"]).default("error"),
      log_dir: z.string().default("../application-logs"),
      max_files: z.string().default("15d"),
      max_size: z.string().default("20m"),
    }),

    // Rate limiting — windowMs is the time window in ms, max is the allowed
    // request count within that window per key (IP, or IP+email for email routes).
    rate_limit: z.object({
      global: z.object({ windowMs: z.number(), max: z.number() }), // blanket /api/v1 protection
      auth: z.object({ windowMs: z.number(), max: z.number() }), // login brute-force
      email: z.object({ windowMs: z.number(), max: z.number() }), // email-send abuse
    }),

  })
  .parse({
    appName: process.env.APP_NAME,
    port: process.env.PORT ? parseInt(process.env.PORT) : 9000,
    node_env: process.env.NODE_ENV,
    cors: {
      allowed_origins: process.env.CORS_ALLOWED_ORIGINS
        ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean)
        : [],
    },
    auth: {
      cookie: {
        sameSite: (process.env.AUTH_COOKIE_SAMESITE ??
          (process.env.NODE_ENV === ENodeEnv.PROD ? "none" : "lax")) as "lax" | "none" | "strict",
        secure:
          (process.env.AUTH_COOKIE_SAMESITE ??
            (process.env.NODE_ENV === ENodeEnv.PROD ? "none" : "lax")) === "none"
            ? true
            : process.env.AUTH_COOKIE_SECURE !== undefined
              ? process.env.AUTH_COOKIE_SECURE === "true"
              : process.env.NODE_ENV === ENodeEnv.PROD,
      },
    },
    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
      password: process.env.REDIS_PASSWORD,
    },
    mongo_uri: process.env.MONGO_URI,
    bcrypt_saltRounds: process.env.BCRYPT_SALT_ROUNDS
      ? parseInt(process.env.BCRYPT_SALT_ROUNDS)
      : 12,
    jwt: {
      accessToken: {
        secret: process.env.JWT_ACCESS_TOKEN_SECRET,
        exp: process.env.JWT_ACCESS_TOKEN_EXPIRE_IN,
      },
      refreshToken: {
        secret: process.env.JWT_REFRESH_TOKEN_SECRET,
        exp: process.env.JWT_REFRESH_TOKEN_EXPIRE_IN,
      },
    },
    mail: {
      admin_contact_email: process.env.ADMIN_CONTACT_EMAIL,
      resend_api_key: process.env.RESEND_API_KEY
    },
    frontend: {
      reset_page_url: process.env.FRONTEND_RESET_PAGE_URL,
      verify_page_url: process.env.FRONTEND_VERIFY_PAGE_URL,
    },
    google: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET }
      : undefined,
    backend_base_url: process.env.BACKEND_BASE_URL,
    cloudflare_r2: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
      bucketName: process.env.CLOUDFLARE_BUCKET_NAME,
      region: process.env.CLOUDFLARE_REGION || "auto",
      customDomain: process.env.CLOUDFLARE_CUSTOM_DOMAIN,
    },
    application_log_config: {
      log_level: process.env.APPLICATION_LOG_LEVEL || "debug",
      error_logs_level: process.env.APPLICATION_LOG_ERROR_LEVEL || "error",
      log_dir: process.env.APPLICATION_LOG_DIR || "../application-logs",
      max_files: process.env.APPLICATION_LOG_MAX_FILES || "15d",
      max_size: process.env.APPLICATION_LOG_MAX_SIZE || "20m",
    },
    rate_limit: {
      global: {
        windowMs: process.env.RATE_LIMIT_GLOBAL_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS) : 15 * 60 * 1000, // 15 min
        max: process.env.RATE_LIMIT_GLOBAL_MAX ? parseInt(process.env.RATE_LIMIT_GLOBAL_MAX) : 100,
      },
      auth: {
        windowMs: process.env.RATE_LIMIT_AUTH_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS) : 15 * 60 * 1000, // 15 min
        max: process.env.RATE_LIMIT_AUTH_MAX ? parseInt(process.env.RATE_LIMIT_AUTH_MAX) : 5,
      },
      email: {
        windowMs: process.env.RATE_LIMIT_EMAIL_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_EMAIL_WINDOW_MS) : 60 * 60 * 1000, // 1 hour
        max: process.env.RATE_LIMIT_EMAIL_MAX ? parseInt(process.env.RATE_LIMIT_EMAIL_MAX) : 3,
      },
    }
  });
export default envConfig;
