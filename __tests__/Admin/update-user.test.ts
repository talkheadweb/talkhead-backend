import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { adminToken, INVALID_ID, mockUserDoc, userToken, VALID_ID } from "./_helpers";
import { AuthRedisService } from "@/App/Auth/redisService";

jest.mock("@/App/Auth/model");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: { refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn().mockResolvedValue(1) } },
}));

const MockUser = UserModel as jest.Mocked<typeof UserModel>;
const MockRedis = AuthRedisService as jest.Mocked<typeof AuthRedisService>;
const endpoint  = (id = VALID_ID) => `/api/v1/admin/users/${id}`;

describe("PATCH /admin/users/:id", () => {
  beforeEach(() => {
    MockUser.findOne          = jest.fn().mockResolvedValue(null);
    MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(mockUserDoc());
  });

  it("200 — updates user fields", async () => {
    const res = await request(app).patch(endpoint()).set("Authorization", `Bearer ${adminToken}`).send({ name: "Updated" });
    expect(res.status).toBe(200);
    expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(VALID_ID, { $set: { name: "Updated" } }, { new: true });
  });

  it("200 — suspending user revokes their session", async () => {
    MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(mockUserDoc({ isActive: false }));
    const res = await request(app).patch(endpoint()).set("Authorization", `Bearer ${adminToken}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(MockRedis.refreshToken.del).toHaveBeenCalledWith(VALID_ID);
  });

  it("404 — user not found", async () => {
    MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    const res = await request(app).patch(endpoint()).set("Authorization", `Bearer ${adminToken}`).send({ name: "NotFound User" });
    expect(res.status).toBe(404);
  });

  it("409 — email already in use", async () => {
    MockUser.findOne = jest.fn().mockResolvedValue(mockUserDoc({ _id: "other-id" }));
    const res = await request(app).patch(endpoint()).set("Authorization", `Bearer ${adminToken}`).send({ email: "taken@example.com" });
    expect(res.status).toBe(409);
  });

  it("400 — empty body", async () => {
    const res = await request(app).patch(endpoint()).set("Authorization", `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(400);
  });

  it("400 — invalid ObjectId", async () => {
    const res = await request(app).patch(endpoint(INVALID_ID)).set("Authorization", `Bearer ${adminToken}`).send({ name: "X" });
    expect(res.status).toBe(400);
  });

  it("401 — unauthenticated", async () => {
    const res = await request(app).patch(endpoint()).send({ name: "Updated" });
    expect(res.status).toBe(401);
  });

  it("403 — non-admin", async () => {
    const res = await request(app).patch(endpoint()).set("Authorization", `Bearer ${userToken}`).send({ name: "Updated" });
    expect(res.status).toBe(403);
  });
});
