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
// In development, a "_dev" suffix is appended automatically so dev and prod
// cookies never collide when both share the same root domain
// (e.g. dev-api.talkhead.ai + api.talkhead.ai with Domain=.talkhead.ai).
// Production always uses the plain names — no config needed.
const _suffix = process.env.NODE_ENV === "production" ? "" : "_dev";
export const REFRESH_COOKIE_NAME  = `refresh_token${_suffix}` as string;
export const ACCESS_COOKIE_NAME   = `access_token${_suffix}` as string;
// JS-readable (not httpOnly) — contains public user info only, never tokens.
// Frontend reads this synchronously to know if a session exists and who the user is
// without a network round-trip. Real authentication still uses the httpOnly cookies.
export const SESSION_INFO_COOKIE_NAME = `session_info${_suffix}` as string;

type CookieConfig = { sameSite: "lax" | "none" | "strict"; secure: boolean; domain?: string };

const baseOptions = (cookie: CookieConfig): CookieOptions => ({
  httpOnly: true,
  secure  : cookie.sameSite === "none" ? true : cookie.secure,
  sameSite: cookie.sameSite,
  ...(cookie.domain ? { domain: cookie.domain } : {}),
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

// session_info is intentionally NOT httpOnly so JS can read it.
// It carries only public fields — never the token itself.
export const getSessionInfoCookieOptions = (
  cookie: CookieConfig,
): { set: CookieOptions; clear: CookieOptions } => {
  const base: CookieOptions = {
    httpOnly: false,
    secure  : cookie.sameSite === "none" ? true : cookie.secure,
    sameSite: cookie.sameSite,
    ...(cookie.domain ? { domain: cookie.domain } : {}),
  };
  const set: CookieOptions   = { ...base, maxAge: AUTH_TTL.REFRESH * 1000 };
  const { maxAge: _maxAge, ...clear } = set;
  return { set, clear };
};
