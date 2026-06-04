import request from "supertest";
import jwt from "jsonwebtoken";
import app from "@/app";
import { JwtHelper } from "@/Utils/helper/jwtHelper";

jest.mock("@/Utils/helper/jwtHelper");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    refreshToken: { set: jest.fn(), get: jest.fn().mockResolvedValue(null), del: jest.fn() },
    verifyToken : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    resetToken  : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

import { AuthRedisService } from "@/App/Auth/redisService";
const MockJwt = JwtHelper as jest.Mocked<typeof JwtHelper>;

const ENDPOINT = "/api/v1/auth/refresh-token";

const validToken = jwt.sign(
  { uid: "user123", email: "test@example.com", role: "user" },
  "test-refresh-secret-32-chars-lon!",
  { expiresIn: "7d" },
);

describe("POST /auth/refresh-token", () => {
  beforeEach(() => {
    MockJwt.verifyRefreshToken.mockReturnValue({ uid: "user123", email: "test@example.com", role: "user" } as any);
    (AuthRedisService.refreshToken.get as jest.Mock).mockResolvedValue(validToken);
    MockJwt.signAccessToken.mockReturnValue("new-access-token");
  });

  it("200 — returns new access token", async () => {
    const res = await request(app).post(ENDPOINT).set("Cookie", [`refresh_token=${validToken}`]);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe("new-access-token");
  });

  it("401 — no cookie", async () => {
    const res = await request(app).post(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it("401 — invalid JWT", async () => {
    MockJwt.verifyRefreshToken.mockImplementation(() => { throw new Error("invalid"); });
    const res = await request(app).post(ENDPOINT).set("Cookie", ["refresh_token=bad.token"]);
    expect(res.status).toBe(401);
  });

  it("401 — token not in Redis (revoked)", async () => {
    (AuthRedisService.refreshToken.get as jest.Mock).mockResolvedValue(null);
    const res = await request(app).post(ENDPOINT).set("Cookie", [`refresh_token=${validToken}`]);
    expect(res.status).toBe(401);
  });

  it("401 — token mismatch with stored", async () => {
    (AuthRedisService.refreshToken.get as jest.Mock).mockResolvedValue("different-token");
    const res = await request(app).post(ENDPOINT).set("Cookie", [`refresh_token=${validToken}`]);
    expect(res.status).toBe(401);
  });
});
