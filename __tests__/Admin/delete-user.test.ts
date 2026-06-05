import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { AuthRedisService } from "@/App/Auth/redisService";
import { adminToken, INVALID_ID, mockUserDoc, userToken, VALID_ID } from "./_helpers";

jest.mock("@/App/Auth/model");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: { refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn().mockResolvedValue(1) } },
}));

const MockUser  = UserModel as jest.Mocked<typeof UserModel>;
const MockRedis = AuthRedisService as jest.Mocked<typeof AuthRedisService>;
const endpoint  = (id = VALID_ID) => `/api/v1/admin/users/${id}`;

describe("DELETE /admin/users/:id", () => {
  beforeEach(() => {
    MockUser.findByIdAndDelete = jest.fn().mockResolvedValue(mockUserDoc());
  });

  it("200 — deletes user and revokes session", async () => {
    const res = await request(app).delete(endpoint()).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(MockUser.findByIdAndDelete).toHaveBeenCalledWith(VALID_ID);
    expect(MockRedis.refreshToken.del).toHaveBeenCalledWith(VALID_ID);
  });

  it("404 — user not found", async () => {
    MockUser.findByIdAndDelete = jest.fn().mockResolvedValue(null);
    const res = await request(app).delete(endpoint()).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("400 — invalid ObjectId", async () => {
    const res = await request(app).delete(endpoint(INVALID_ID)).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("401 — unauthenticated", async () => {
    const res = await request(app).delete(endpoint());
    expect(res.status).toBe(401);
  });

  it("403 — non-admin", async () => {
    const res = await request(app).delete(endpoint()).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});
