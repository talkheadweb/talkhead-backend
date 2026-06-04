import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { MailUtils } from "@/Utils/mail/resend";

jest.mock("@/App/Auth/model");
jest.mock("@/Utils/mail/resend");
jest.mock("uuid", () => ({ v4: () => "verify-uuid" }));
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    verifyToken : { set: jest.fn().mockResolvedValue("OK"), get: jest.fn(), del: jest.fn() },
    refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    resetToken  : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

import { AuthRedisService } from "@/App/Auth/redisService";
const MockUser = UserModel as jest.Mocked<typeof UserModel>;
const MockMail = MailUtils as jest.Mocked<typeof MailUtils>;
const ENDPOINT = "/api/v1/auth/resend-verification";

const userDoc = (overrides = {}) => ({ _id: "user123", email: "test@example.com", isVerified: false, ...overrides });

describe("POST /auth/resend-verification", () => {
  beforeEach(() => {
    MockUser.findOne.mockResolvedValue(userDoc() as any);
    MockMail.sendMail.mockResolvedValue({ id: "mail-id" } as any);
  });

  it("200 — stores new token and sends email", async () => {
    const res = await request(app).post(ENDPOINT).send({ email: "test@example.com" });
    expect(res.status).toBe(200);
    expect(AuthRedisService.verifyToken.set).toHaveBeenCalledWith("user123", "verify-uuid");
    expect(MockMail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "test@example.com" }),
    );
  });

  it("200 — returns success silently when email not found (prevents email enumeration)", async () => {
    MockUser.findOne.mockResolvedValue(null);
    const res = await request(app).post(ENDPOINT).send({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(MockMail.sendMail).not.toHaveBeenCalled();
  });

  it("200 — returns success silently when already verified (prevents email enumeration)", async () => {
    MockUser.findOne.mockResolvedValue(userDoc({ isVerified: true }) as any);
    const res = await request(app).post(ENDPOINT).send({ email: "test@example.com" });
    expect(res.status).toBe(200);
    expect(MockMail.sendMail).not.toHaveBeenCalled();
  });

  it("400 — invalid email", async () => {
    const res = await request(app).post(ENDPOINT).send({ email: "bad" });
    expect(res.status).toBe(400);
  });
});
