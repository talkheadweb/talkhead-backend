import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";

jest.mock("@/App/Auth/model");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    verifyToken : { set: jest.fn(), get: jest.fn().mockResolvedValue("valid-token"), del: jest.fn().mockResolvedValue(1) },
    refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    resetToken  : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

import { AuthRedisService } from "@/App/Auth/redisService";
const MockUser = UserModel as jest.Mocked<typeof UserModel>;

const ENDPOINT = "/api/v1/auth/verify-email";
// userId must be a valid MongoDB ObjectId (24-hex chars)
const VALID_USER_ID = "507f1f77bcf86cd799439011";
const validBody = { userId: VALID_USER_ID, token: "valid-token" };

describe("POST /auth/verify-email", () => {
  beforeEach(() => {
    MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
  });

  it("200 — marks user as verified and deletes token", async () => {
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(200);
    expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(VALID_USER_ID, { isVerified: true });
    expect(AuthRedisService.verifyToken.del).toHaveBeenCalledWith(VALID_USER_ID);
  });

  it("400 — token expired", async () => {
    (AuthRedisService.verifyToken.get as jest.Mock).mockResolvedValue(null);
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(400);
    expect(MockUser.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("400 — token mismatch", async () => {
    (AuthRedisService.verifyToken.get as jest.Mock).mockResolvedValue("different");
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(400);
  });

  it("400 — missing userId", async () => {
    const { userId: _u, ...body } = validBody;
    expect((await request(app).post(ENDPOINT).send(body)).status).toBe(400);
  });

  it("400 — invalid userId (not a MongoDB ObjectId)", async () => {
    const res = await request(app).post(ENDPOINT).send({ ...validBody, userId: "not-an-object-id" });
    expect(res.status).toBe(400);
  });
});
