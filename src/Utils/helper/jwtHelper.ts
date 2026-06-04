import config from "@/Config";
import { CustomJwtPayload } from "@/Utils/types/jwtHelper.type";
import jwt from "jsonwebtoken";

type TTokenPayload = Pick<CustomJwtPayload, "uid" | "email" | "role">;

const signAccessToken = (payload: TTokenPayload): string =>
  jwt.sign(payload, config.jwt.accessToken.secret, {
    expiresIn: config.jwt.accessToken.exp as jwt.SignOptions["expiresIn"],
  });

const signRefreshToken = (payload: TTokenPayload): string =>
  jwt.sign(payload, config.jwt.refreshToken.secret, {
    expiresIn: config.jwt.refreshToken.exp as jwt.SignOptions["expiresIn"],
  });

const verifyAccessToken = (token: string): CustomJwtPayload =>
  jwt.verify(token, config.jwt.accessToken.secret) as CustomJwtPayload;

const verifyRefreshToken = (token: string): CustomJwtPayload =>
  jwt.verify(token, config.jwt.refreshToken.secret) as CustomJwtPayload;

export const JwtHelper = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
