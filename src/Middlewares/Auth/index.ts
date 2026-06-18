import config from "@/Config";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  getAccessTokenCookieOptions,
} from "@/App/Auth/const";
import { resolveSession } from "@/App/Auth/utils";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { LogService } from "@/Config/logger/utils";
import CustomError from "@/Utils/errors/customError.class";
import catchAsync from "@/Utils/helper/catchAsync";
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
 * Silent refresh:
 *   When the access token is expired but a valid refresh_token cookie exists,
 *   resolveSession() validates the refresh token + Redis revocation check, then
 *   this middleware issues a new access_token cookie and proceeds — no 401,
 *   the user never notices.
 */
const authenticate = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const cookieToken = req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : undefined;

  const accessToken  = cookieToken ?? bearerToken;
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;

  log.debug("authenticate: token sources", {
    hasCookieToken  : !!cookieToken,
    hasBearerToken  : !!bearerToken,
    hasRefreshCookie: !!refreshToken,
    path            : req.path,
  });

  let session;
  try {
    session = await resolveSession(accessToken, refreshToken);
  } catch (err: any) {
    throw new CustomError(err.message ?? "Authentication required.", 401);
  }

  // When the access token was expired and the refresh token was used, issue a
  // new access_token cookie so the browser stays in sync automatically.
  let resolvedToken = accessToken;
  if (session.refreshed) {
    resolvedToken = JwtHelper.signAccessToken({
      uid  : session.uid,
      email: session.email,
      role : session.role,
    });
    res.cookie(ACCESS_COOKIE_NAME, resolvedToken, accessCookieOptions);
    log.info("Access token silently refreshed", { uid: session.uid });
  }

  req.user = {
    uid        : session.uid,
    email      : session.email,
    role       : session.role,
    accessToken: resolvedToken ?? "",
  };

  log.debug("Access token verified", { uid: session.uid });
  next();
});

export default authenticate;
