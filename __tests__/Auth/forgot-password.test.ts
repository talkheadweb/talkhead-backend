import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { MailUtils } from "@/Utils/mail/resend";

jest.mock("@/App/Auth/model");
jest.mock("@/Utils/mail/resend");
jest.mock("uuid", () => ({ v4: () => "reset-uuid" }));
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    resetToken  : { set: jest.fn().mockResolvedValue("OK"), get: jest.fn(), del: jest.fn() },
    refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    verifyToken : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

import { AuthRedisService } from "@/App/Auth/redisService";
const MockUser = UserModel as jest.Mocked<typeof UserModel>;
const MockMail = MailUtils as jest.Mocked<typeof MailUtils>;
const ENDPOINT = "/api/v1/auth/forgot-password";

describe("POST /auth/forgot-password", () => {
  beforeEach(() => {
    MockUser.findOne.mockResolvedValue({ _id: "user123", email: "test@example.com" } as any);
    MockMail.sendMail.mockResolvedValue({ id: "mail-id" } as any);
  });

  it("200 — stores reset token and sends email", async () => {
    const res = await request(app).post(ENDPOINT).send({ email: "test@example.com" });
    expect(res.status).toBe(200);
    expect(AuthRedisService.resetToken.set).toHaveBeenCalledWith("user123", "reset-uuid");
    expect(MockMail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "test@example.com", subject: "Reset your password" }),
    );
  });

  it("200 — silent success when email not found (prevents enumeration)", async () => {
    MockUser.findOne.mockResolvedValue(null);
    const res = await request(app).post(ENDPOINT).send({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(MockMail.sendMail).not.toHaveBeenCalled();
  });

  it("400 — invalid email", async () => {
    const res = await request(app).post(ENDPOINT).send({ email: "bad" });
    expect(res.status).toBe(400);
  });
});
