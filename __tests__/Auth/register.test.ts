import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { MailUtils } from "@/Utils/mail/resend";

jest.mock("@/App/Auth/model");
jest.mock("@/Utils/mail/resend");
jest.mock("uuid", () => ({ v4: () => "test-uuid" }));
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    verifyToken : { set: jest.fn().mockResolvedValue("OK"), get: jest.fn(), del: jest.fn() },
    refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    resetToken  : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

import { AuthRedisService } from "@/App/Auth/redisService";
const MockUser  = UserModel  as jest.Mocked<typeof UserModel>;
const MockMail  = MailUtils  as jest.Mocked<typeof MailUtils>;

const ENDPOINT  = "/api/v1/auth/register";
const validBody = { name: "Test User", email: "test@example.com", password: "password123" };
const mockDoc   = {
  _id: "user123", name: "Test User", email: "test@example.com", role: "user",
  toObject: () => ({ _id: "user123", name: "Test User", email: "test@example.com" }),
};

describe("POST /auth/register", () => {
  beforeEach(() => {
    MockUser.findOne.mockResolvedValue(null);
    MockUser.create.mockResolvedValue(mockDoc as any);
    MockMail.sendMail.mockResolvedValue({ id: "mail-id" } as any);
  });

  it("201 — creates account, no data in response", async () => {
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeUndefined();
  });

  it("stores verify token in Redis", async () => {
    await request(app).post(ENDPOINT).send(validBody);
    expect(AuthRedisService.verifyToken.set).toHaveBeenCalledWith("user123", "test-uuid");
  });

  it("sends verification email", async () => {
    await request(app).post(ENDPOINT).send(validBody);
    expect(MockMail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "test@example.com", subject: "Verify your email address" }),
    );
  });

  it("role is never accepted from the client — always defaults to USER in the schema", async () => {
    await request(app).post(ENDPOINT).send(validBody);
    // role must NOT be passed to create() — the Mongoose schema default handles it
    expect(MockUser.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ role: expect.anything() }),
    );
  });

  it("201 — unknown role field in body is silently ignored (not a validation error)", async () => {
    // role is stripped from the schema, so any value is simply dropped
    const res = await request(app).post(ENDPOINT).send({ ...validBody, role: "superadmin" });
    expect(res.status).toBe(201);
  });

  it("400 — name shorter than 2 characters", async () => {
    const res = await request(app).post(ENDPOINT).send({ ...validBody, name: "T" });
    expect(res.status).toBe(400);
  });

  it("400 — invalid email", async () => {
    const res = await request(app).post(ENDPOINT).send({ ...validBody, email: "bad" });
    expect(res.status).toBe(400);
  });

  it("400 — password too short (less than 8 characters)", async () => {
    const res = await request(app).post(ENDPOINT).send({ ...validBody, password: "123" });
    expect(res.status).toBe(400);
  });

  it("409 — email already exists", async () => {
    MockUser.findOne.mockResolvedValue(mockDoc as any);
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(409);
    expect(MockUser.create).not.toHaveBeenCalled();
  });
});
