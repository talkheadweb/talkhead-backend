import { RedisClient } from "@/Config/redis/connection";
import { AUTH_REDIS_PREFIX, AUTH_TTL } from "./const";

// ── Generic token store ────────────────────────────────────────────────────
class TokenRedisService {
  constructor(
    private readonly prefix: string,
    private readonly ttl  : number,
  ) {}

  set(userId: string, token: string) {
    return RedisClient.set(`${this.prefix}:${userId}`, token, "EX", this.ttl);
  }

  get(userId: string) {
    return RedisClient.get(`${this.prefix}:${userId}`);
  }

  del(userId: string) {
    return RedisClient.del(`${this.prefix}:${userId}`);
  }
}

// ── Auth module instances ──────────────────────────────────────────────────
export const AuthRedisService = {
  refreshToken: new TokenRedisService(AUTH_REDIS_PREFIX.REFRESH, AUTH_TTL.REFRESH),
  verifyToken : new TokenRedisService(AUTH_REDIS_PREFIX.VERIFY,  AUTH_TTL.VERIFY),
  resetToken  : new TokenRedisService(AUTH_REDIS_PREFIX.RESET,   AUTH_TTL.RESET),
};
