import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { HashHelper } from "@/Utils/helper/hashHelper";

jest.mock("@/App/Auth/model");
jest.mock("@/Utils/helper/hashHelper");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    resetToken  : { set: jest.fn(), get: jest.fn().mockResolvedValue("valid-token"), del: jest.fn().mockResolvedValue(1) },
    refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    verifyToken : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

import { AuthRedisService } from "@/App/Auth/redisService";
const MockUser = UserModel  as jest.Mocked<typeof UserModel>;
const MockHash = HashHelper as jest.Mocked<typeof HashHelper>;

const ENDPOINT = "/api/v1/auth/reset-password";
// userId must be a valid MongoDB ObjectId (24-hex chars)
const VALID_USER_ID = "507f1f77bcf86cd799439011";
const validBody = { userId: VALID_USER_ID, token: "valid-token", password: "newPassword123" };

describe("POST /auth/reset-password", () => {
  beforeEach(() => {
    MockHash.generateHashPassword.mockResolvedValue("new-hashed");
    MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
  });

  it("200 — resets password and deletes Redis token", async () => {
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(200);
    expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(VALID_USER_ID, { password: "new-hashed" });
    expect(AuthRedisService.resetToken.del).toHaveBeenCalledWith(VALID_USER_ID);
  });

  it("400 — token expired", async () => {
    (AuthRedisService.resetToken.get as jest.Mock).mockResolvedValue(null);
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(400);
  });

  it("400 — token mismatch", async () => {
    (AuthRedisService.resetToken.get as jest.Mock).mockResolvedValue("different");
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(400);
  });

  it("400 — missing userId", async () => {
    const { userId: _u, ...body } = validBody;
    expect((await request(app).post(ENDPOINT).send(body)).status).toBe(400);
  });

  it("400 — invalid userId (not a MongoDB ObjectId)", async () => {
    const res = await request(app).post(ENDPOINT).send({ ...validBody, userId: "not-an-id" });
    expect(res.status).toBe(400);
  });

  it("400 — password too short (less than 8 characters)", async () => {
    expect((await request(app).post(ENDPOINT).send({ ...validBody, password: "123" })).status).toBe(400);
  });
});
