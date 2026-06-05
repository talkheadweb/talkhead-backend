import config from "@/Config";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  getAccessTokenCookieOptions,
} from "@/App/Auth/const";
import { AuthRedisService } from "@/App/Auth/redisService";
import { LogService } from "@/Config/logger/utils";
import CustomError from "@/Utils/errors/customError.class";
import catchAsync from "@/Utils/helper/catchAsync";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { NextFunction, Request, Response } from "express";

const log = LogService.AUTH;
const { set: accessCookieOptions } = getAccessTokenCookieOptions(config.auth.cookie);

/**
 * Authentication middleware — fully cookie-managed with silent token refresh.
 *
 * Token resolution order (first valid token wins):
 *   1. access_token  cookie        (set by login / silent refresh)
 *   2. Authorization: Bearer <token>  (mobile apps / API clients)
 *
 * Silent refresh flow:
 *   When the access token is expired but a valid refresh_token cookie exists,
 *   the middleware issues a new access_token cookie and proceeds with the
 *   original request — no retry, no 401, the user never notices.
 *
 * Hard 401 cases:
 *   - No token at all
 *   - Access token invalid (tampered signature)
 *   - Access token expired AND refresh token missing / invalid / revoked
 */
const authenticate = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  // ── 1. Read token — cookie first, Authorization header as fallback ─────────
  const cookieToken  = req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;
  const bearerToken  = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : undefined;

  log.debug("authenticate: token sources", {
    hasCookieToken : !!cookieToken,
    hasBearerToken : !!bearerToken,
    hasRefreshCookie: !!(req.cookies?.[REFRESH_COOKIE_NAME]),
    path: req.path,
  });

  const rawToken = cookieToken ?? bearerToken;

  // ── 2. Try to verify the access token (skip if none present) ─────────────
  if (rawToken) {
    try {
      const payload = JwtHelper.verifyAccessToken(rawToken);
      req.user = {
        uid  : String(payload.uid),
        email: payload.email as string,
        role : payload.role  as string,
      };
      log.debug("Access token verified", { uid: payload.uid });
      return next();
    } catch (err: any) {
      log.debug("authenticate: access token verify failed", { errName: err?.name, errMsg: err?.message });
      // Any error other than expiry (e.g. invalid signature) is an immediate 401
      if (err?.name !== "TokenExpiredError") {
        throw new CustomError("Invalid access token.", 401);
      }
      // TokenExpiredError — fall through to silent refresh below
    }
  }
  // No access token present at all — also fall through to silent refresh.
  // An expired cookie is simply absent from the request, so rawToken can be
  // undefined even when the user has a valid refresh_token cookie.

  // ── 3. No valid access token — attempt silent refresh via cookie ──────────
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (!refreshToken) {
    log.debug("authenticate: no access token and no refresh_token cookie");
    throw new CustomError("Authentication required.", 401);
  }

  let refreshPayload;
  try {
    refreshPayload = JwtHelper.verifyRefreshToken(refreshToken);
  } catch (err: any) {
    log.debug("authenticate: refresh token verify failed", { errName: err?.name });
    throw new CustomError("Session expired. Please log in again.", 401);
  }

  // Normalise uid to a plain hex string.
  // Redis keys are stored via user._id.toString() (plain hex), so we must match
  // that format regardless of how the JWT payload serialised the ObjectId.
  const uid = String(refreshPayload.uid);

  // Confirm the refresh token is still live in Redis (revocation check)
  const stored = await AuthRedisService.refreshToken.get(uid);
  if (!stored || stored !== refreshToken) {
    log.debug("authenticate: refresh token Redis mismatch", { uid, hasStored: !!stored, matches: stored === refreshToken });
    throw new CustomError("Session expired. Please log in again.", 401);
  }

  // Issue new access token and set it as a cookie — browser stores it automatically
  const newAccessToken = JwtHelper.signAccessToken({
    uid,
    email: refreshPayload.email,
    role : refreshPayload.role,
  });
  res.cookie(ACCESS_COOKIE_NAME, newAccessToken, accessCookieOptions);

  req.user = {
    uid,
    email: refreshPayload.email as string,
    role : refreshPayload.role  as string,
  };

  log.info("Access token silently refreshed", { uid });
  next();
});

export default authenticate;
