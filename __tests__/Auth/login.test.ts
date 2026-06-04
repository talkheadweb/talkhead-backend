import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { HashHelper } from "@/Utils/helper/hashHelper";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { MailUtils } from "@/Utils/mail/resend";

jest.mock("@/App/Auth/model");
jest.mock("@/Utils/helper/hashHelper");
jest.mock("@/Utils/helper/jwtHelper");
jest.mock("@/Utils/mail/resend");
jest.mock("uuid", () => ({ v4: () => "auto-verify-uuid" }));
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    refreshToken: { set: jest.fn().mockResolvedValue("OK"), get: jest.fn(), del: jest.fn() },
    verifyToken : { set: jest.fn().mockResolvedValue("OK"), get: jest.fn(), del: jest.fn() },
    resetToken  : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

import { AuthRedisService } from "@/App/Auth/redisService";
const MockUser = UserModel  as jest.Mocked<typeof UserModel>;
const MockHash = HashHelper as jest.Mocked<typeof HashHelper>;
const MockJwt  = JwtHelper  as jest.Mocked<typeof JwtHelper>;
const MockMail = MailUtils  as jest.Mocked<typeof MailUtils>;

const ENDPOINT  = "/api/v1/auth/login";
const validBody = { email: "test@example.com", password: "password123" };

const mockDoc = (overrides = {}) => ({
  _id: "user123", email: "test@example.com", name: "Test User",
  role: "user", password: "hashed_pw", isVerified: true,
  toObject: () => ({ _id: "user123", name: "Test User", email: "test@example.com", role: "user", isVerified: true }),
  ...overrides,
});

const selectMock = (val: any) => ({ select: jest.fn().mockResolvedValue(val) });

describe("POST /auth/login", () => {
  beforeEach(() => {
    MockUser.findOne.mockReturnValue(selectMock(mockDoc()) as any);
    MockHash.comparePassword.mockResolvedValue(true);
    MockJwt.signAccessToken.mockReturnValue("access-token");
    MockJwt.signRefreshToken.mockReturnValue("refresh-token");
    MockMail.sendMail.mockResolvedValue({ id: "mail-id" } as any);
  });

  // ── Happy path ─────────────────────────────────────────────────────────
  it("200 — returns accessToken and user (no password)", async () => {
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe("access-token");
    expect(res.body.data.user.email).toBe("test@example.com");
    expect(res.body.data.user).not.toHaveProperty("password");
  });

  it("sets httpOnly refresh_token cookie", async () => {
    const res = await request(app).post(ENDPOINT).send(validBody);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies[0]).toMatch(/refresh_token/);
    expect(cookies[0]).toMatch(/HttpOnly/i);
  });

  it("stores refresh token in Redis", async () => {
    await request(app).post(ENDPOINT).send(validBody);
    expect(AuthRedisService.refreshToken.set).toHaveBeenCalledWith("user123", "refresh-token");
  });

  // ── Validation ─────────────────────────────────────────────────────────
  it("400 — missing password", async () => {
    const res = await request(app).post(ENDPOINT).send({ email: "test@example.com" });
    expect(res.status).toBe(400);
  });

  // ── Auth failures ──────────────────────────────────────────────────────
  it("401 — user not found", async () => {
    MockUser.findOne.mockReturnValue(selectMock(null) as any);
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(401);
  });

  it("401 — wrong password", async () => {
    MockHash.comparePassword.mockResolvedValue(false);
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(401);
  });

  // ── Unverified email — key business logic ─────────────────────────────
  it("403 — email not verified AND auto-resends verification email", async () => {
    MockUser.findOne.mockReturnValue(selectMock(mockDoc({ isVerified: false })) as any);

    const res = await request(app).post(ENDPOINT).send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verification link has been sent/i);

    // Auto-resend: a fresh token must be stored in Redis and emailed
    expect(AuthRedisService.verifyToken.set).toHaveBeenCalledWith("user123", "auto-verify-uuid");
    expect(MockMail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "test@example.com", subject: "Verify your email address" }),
    );

    // Session must NOT be created for unverified users
    expect(AuthRedisService.refreshToken.set).not.toHaveBeenCalled();
  });

  it("403 — still returns 403 even when auto-resend email fails", async () => {
    MockUser.findOne.mockReturnValue(selectMock(mockDoc({ isVerified: false })) as any);
    MockMail.sendMail.mockRejectedValue(new Error("mail service down"));

    const res = await request(app).post(ENDPOINT).send(validBody);

    // Service swallows mail errors — user still gets the 403 guidance
    expect(res.status).toBe(403);
  });
});
