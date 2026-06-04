import request from "supertest";
import jwt from "jsonwebtoken";
import app from "@/app";

jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn().mockResolvedValue(1) },
    verifyToken : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    resetToken  : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

import { AuthRedisService } from "@/App/Auth/redisService";

const ENDPOINT = "/api/v1/auth/logout";

const validToken = jwt.sign(
  { uid: "user123", email: "test@example.com", role: "user" },
  "test-refresh-secret-32-chars-lon!",
  { expiresIn: "7d" },
);

describe("POST /auth/logout", () => {
  it("200 — deletes Redis refresh token when cookie present", async () => {
    const res = await request(app).post(ENDPOINT).set("Cookie", [`refresh_token=${validToken}`]);
    expect(res.status).toBe(200);
    expect(AuthRedisService.refreshToken.del).toHaveBeenCalledWith("user123");
  });

  it("clears refresh_token cookie", async () => {
    const res = await request(app).post(ENDPOINT).set("Cookie", [`refresh_token=${validToken}`]);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("refresh_token=;"))).toBe(true);
  });

  it("200 — succeeds with no cookie", async () => {
    const res = await request(app).post(ENDPOINT);
    expect(res.status).toBe(200);
    expect(AuthRedisService.refreshToken.del).not.toHaveBeenCalled();
  });

  it("200 — succeeds even with expired/invalid cookie", async () => {
    const expired = jwt.sign({ uid: "u", email: "e", role: "user" }, "test-refresh-secret-32-chars-lon!", { expiresIn: -1 });
    const res = await request(app).post(ENDPOINT).set("Cookie", [`refresh_token=${expired}`]);
    expect(res.status).toBe(200);
  });
});
