import { CookieOptions } from "express";

// ── Redis TTLs (seconds) ───────────────────────────────────────────────────
export const AUTH_TTL = {
  REFRESH: 7 * 24 * 60 * 60,  // 7 days
  ACCESS: 1 * 60,            // 1 min  — keep in sync with JWT_ACCESS_EXP
  VERIFY: 24 * 60 * 60,       // 24 hours
  RESET: 60 * 60,            // 1 hour
  SOCIAL_CODE: 2 * 60,        // 2 min — one-time OAuth claim code
  PRESIGNED_URL_CACHE: 10 * 60, // 10 min — cached presigned URL (URL itself valid for 15 min)
} as const;

// ── Redis key prefixes ─────────────────────────────────────────────────────
export const AUTH_REDIS_PREFIX = {
  REFRESH: "auth:refresh",
  VERIFY: "auth:verify",
  RESET: "auth:reset",
  SOCIAL_CODE: "auth:social-code",
  PRESIGNED_URL: "auth:presigned",
} as const;

// ── Cookie names ───────────────────────────────────────────────────────────
export const REFRESH_COOKIE_NAME = "refresh_token" as const;
export const ACCESS_COOKIE_NAME = "access_token" as const;

/** @deprecated use REFRESH_COOKIE_NAME */
export const COOKIE_NAME = REFRESH_COOKIE_NAME;

type CookieConfig = { sameSite: "lax" | "none" | "strict"; secure: boolean };

const baseOptions = (cookie: CookieConfig): CookieOptions => ({
  httpOnly: true,
  secure: cookie.sameSite === "none" ? true : cookie.secure,
  sameSite: cookie.sameSite,
});

export const getRefreshTokenCookieOptions = (
  cookie: CookieConfig,
): { set: CookieOptions; clear: CookieOptions } => {
  const set: CookieOptions = { ...baseOptions(cookie), maxAge: AUTH_TTL.REFRESH * 1000 };
  const { maxAge: _maxAge, ...clear } = set;
  return { set, clear };
};

export const getAccessTokenCookieOptions = (
  cookie: CookieConfig,
): { set: CookieOptions; clear: CookieOptions } => {
  const set: CookieOptions = { ...baseOptions(cookie), maxAge: AUTH_TTL.ACCESS * 1000 };
  const { maxAge: _maxAge, ...clear } = set;
  return { set, clear };
};
