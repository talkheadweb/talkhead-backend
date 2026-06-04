import { CookieOptions } from "express";

// ── Redis TTLs (seconds) ───────────────────────────────────────────────────
export const AUTH_TTL = {
  REFRESH: 7 * 24 * 60 * 60,  // 7 days
  VERIFY: 24 * 60 * 60,       // 24 hours
  RESET: 60 * 60,            // 1 hour
} as const;

// ── Redis key prefixes ─────────────────────────────────────────────────────
export const AUTH_REDIS_PREFIX = {
  REFRESH: "auth:refresh",
  VERIFY: "auth:verify",
  RESET: "auth:reset",
} as const;

// ── Cookie names ───────────────────────────────────────────────────────────
export const COOKIE_NAME = "refresh_token" as const;

export const getRefreshTokenCookieOptions = (
  cookie: { sameSite: "lax" | "none" | "strict"; secure: boolean },
): { set: CookieOptions; clear: CookieOptions } => {
  const set: CookieOptions = {
    httpOnly: true,
    secure: cookie.sameSite === "none" ? true : cookie.secure,
    sameSite: cookie.sameSite,
    maxAge: AUTH_TTL.REFRESH * 1000,
  };

  const { maxAge: _maxAge, ...clear } = set;
  return { set, clear };
};
