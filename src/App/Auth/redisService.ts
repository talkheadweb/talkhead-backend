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

// ── Social auth code store ─────────────────────────────────────────────────
// Keyed by a random UUID (the "code"), NOT by userId.
// Stores { accessToken, refreshToken } as JSON.
// Single-use: del() is called immediately on claim.
export type TSocialCodePayload = { accessToken: string; refreshToken: string };

class SocialCodeRedisService {
  private readonly prefix = AUTH_REDIS_PREFIX.SOCIAL_CODE;
  private readonly ttl    = AUTH_TTL.SOCIAL_CODE;

  async set(code: string, payload: TSocialCodePayload): Promise<void> {
    await RedisClient.set(`${this.prefix}:${code}`, JSON.stringify(payload), "EX", this.ttl);
  }

  async get(code: string): Promise<TSocialCodePayload | null> {
    const raw = await RedisClient.get(`${this.prefix}:${code}`);
    if (!raw) return null;
    return JSON.parse(raw) as TSocialCodePayload;
  }

  del(code: string) {
    return RedisClient.del(`${this.prefix}:${code}`);
  }
}

// ── Auth module instances ──────────────────────────────────────────────────
export const AuthRedisService = {
  refreshToken: new TokenRedisService(AUTH_REDIS_PREFIX.REFRESH, AUTH_TTL.REFRESH),
  verifyToken : new TokenRedisService(AUTH_REDIS_PREFIX.VERIFY,  AUTH_TTL.VERIFY),
  resetToken  : new TokenRedisService(AUTH_REDIS_PREFIX.RESET,   AUTH_TTL.RESET),
  socialCode  : new SocialCodeRedisService(),
};
