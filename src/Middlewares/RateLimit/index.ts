/*
  Rate limiting middleware.

  - Backed by Redis (rate-limit-redis) so counters are shared across every app
    instance behind a load balancer. A single in-memory limiter would let an
    attacker bypass the cap simply by hitting different instances.
  - In tests (JEST_WORKER_ID is set) the Redis store is skipped AND the limiter
    is short-circuited, so existing endpoint tests aren't throttled and don't
    need a live Redis. The factory still accepts an explicit `skip` override so
    the dedicated rate-limit test can force the limiter on.
  - On limit breach we forward a CustomError(429) into globalErrorHandler, so the
    429 response matches the app's standard { success:false, message } shape.
*/

import config from "@/Config";
import { RedisClient } from "@/Config/redis/connection";
import CustomError from "@/Utils/errors/customError.class";
import { Request } from "express";
import { rateLimit } from "express-rate-limit";
import RedisStore from "rate-limit-redis";

const isTest = !!process.env.JEST_WORKER_ID;

type RateLimiterOptions = {
  windowMs    : number;
  max         : number;
  message     : string;
  prefix      : string;                       // Redis key namespace, e.g. "rl:login:"
  keyGenerator?: (req: Request) => string;     // omit to use the built-in (IP) key
  skip       ?: (req: Request) => boolean;     // defaults to "skip in tests"
};

/**
 * Builds a configured rate-limit middleware.
 * Every preset below is just a call to this factory with different numbers.
 */
export const createRateLimiter = (opts: RateLimiterOptions) =>
  rateLimit({
    windowMs       : opts.windowMs,
    max            : opts.max,
    standardHeaders: true,   // adds RateLimit-* headers
    legacyHeaders  : false,  // disables the deprecated X-RateLimit-* headers
    skip           : opts.skip ?? (() => isTest),
    // Only override the key when a custom generator is supplied; otherwise
    // express-rate-limit uses its own IPv6-safe IP key.
    ...(opts.keyGenerator
      ? { keyGenerator: opts.keyGenerator, validate: false as const }
      : {}),
    // Use Redis in real environments; fall back to in-memory store in tests
    store: isTest
      ? undefined
      : new RedisStore({
          prefix     : opts.prefix,
          sendCommand: (...args: string[]) => RedisClient.call(args[0], ...args.slice(1)) as any,
        }),
    // Route the 429 through our global error handler for a consistent response body
    handler: (_req, _res, next) => next(new CustomError(opts.message, 429)),
  });

/**
 * Composite key for email-sending routes: client IP + target email address.
 * This throttles both "one IP spamming many emails" and "many IPs targeting one
 * inbox", which a pure-IP key would miss.
 */
const ipAndEmailKey = (req: Request): string => {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  return `${req.ip ?? "unknown"}:${email}`;
};

// ── Presets ─────────────────────────────────────────────────────────────────

/** Blanket protection for the whole API surface. */
export const globalLimiter = createRateLimiter({
  windowMs: config.rate_limit.global.windowMs,
  max     : config.rate_limit.global.max,
  prefix  : "rl:global:",
  message : "Too many requests. Please try again later.",
});

/** Brute-force protection for credential-checking routes (login). */
export const loginLimiter = createRateLimiter({
  windowMs: config.rate_limit.auth.windowMs,
  max     : config.rate_limit.auth.max,
  prefix  : "rl:login:",
  message : "Too many login attempts. Please try again in a few minutes.",
});

/** Abuse protection for routes that trigger outbound email. */
export const emailLimiter = createRateLimiter({
  windowMs    : config.rate_limit.email.windowMs,
  max         : config.rate_limit.email.max,
  prefix      : "rl:email:",
  message     : "Too many requests for this email. Please try again later.",
  keyGenerator: ipAndEmailKey,
});
