import request from "supertest";
import jwt from "jsonwebtoken";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { HashHelper } from "@/Utils/helper/hashHelper";

jest.mock("@/App/Auth/model");
jest.mock("@/Utils/helper/hashHelper");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn().mockResolvedValue(1) },
    verifyToken : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    resetToken  : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

import { AuthRedisService } from "@/App/Auth/redisService";
const MockUser = UserModel  as jest.Mocked<typeof UserModel>;
const MockHash = HashHelper as jest.Mocked<typeof HashHelper>;

const ENDPOINT = "/api/v1/auth/change-password";

const authToken = jwt.sign(
  { uid: "user123", email: "test@example.com", role: "user" },
  "test-access-secret-32-chars-long!",
  { expiresIn: "15m" },
);

const validBody = { currentPassword: "oldPassword123", newPassword: "newPassword456" };

const selectMock = (val: any) => ({ select: jest.fn().mockResolvedValue(val) });

const userDoc = {
  _id: "user123", password: "hashed_old_pw",
  toObject: () => ({}),
};

describe("PATCH /auth/change-password", () => {
  beforeEach(() => {
    MockUser.findById.mockReturnValue(selectMock(userDoc) as any);
    MockHash.comparePassword.mockResolvedValue(true);
    MockHash.generateHashPassword.mockResolvedValue("hashed_new_pw");
    MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
  });

  it("200 — changes password and invalidates refresh token", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith("user123", { password: "hashed_new_pw" });
    expect(AuthRedisService.refreshToken.del).toHaveBeenCalledWith("user123");
  });

  it("clears refresh_token cookie after password change", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .send(validBody);

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies?.some((c) => c.startsWith("refresh_token=;"))).toBe(true);
  });

  it("400 — current password incorrect", async () => {
    MockHash.comparePassword.mockResolvedValue(false);
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .send(validBody);
    expect(res.status).toBe(400);
  });

  it("401 — no auth token", async () => {
    const res = await request(app).patch(ENDPOINT).send(validBody);
    expect(res.status).toBe(401);
  });

  it("400 — new password too short", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validBody, newPassword: "123" });
    expect(res.status).toBe(400);
  });

  it("400 — missing currentPassword", async () => {
    const { currentPassword: _c, ...body } = validBody;
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it("404 — user not found", async () => {
    MockUser.findById.mockReturnValue(selectMock(null) as any);
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .send(validBody);
    expect(res.status).toBe(404);
  });
});
