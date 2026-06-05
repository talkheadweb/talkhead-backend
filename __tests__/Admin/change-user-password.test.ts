import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { HashHelper } from "@/Utils/helper/hashHelper";
import { AuthRedisService } from "@/App/Auth/redisService";
import { adminToken, INVALID_ID, mockUserDoc, userToken, VALID_ID } from "./_helpers";

jest.mock("@/App/Auth/model");
jest.mock("@/Utils/helper/hashHelper");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: { refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn().mockResolvedValue(1) } },
}));

const MockUser  = UserModel  as jest.Mocked<typeof UserModel>;
const MockHash  = HashHelper as jest.Mocked<typeof HashHelper>;
const MockRedis = AuthRedisService as jest.Mocked<typeof AuthRedisService>;
const endpoint  = (id = VALID_ID) => `/api/v1/admin/users/${id}/password`;
const validBody = { password: "NewSecurePass1" };

describe("PATCH /admin/users/:id/password", () => {
  beforeEach(() => {
    MockUser.findById         = jest.fn().mockResolvedValue(mockUserDoc());
    MockHash.generateHashPassword = jest.fn().mockResolvedValue("hashed");
    MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
  });

  it("200 — changes password and revokes session", async () => {
    const res = await request(app).patch(endpoint()).set("Authorization", `Bearer ${adminToken}`).send(validBody);
    expect(res.status).toBe(200);
    expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(VALID_ID, { password: "hashed" });
    expect(MockRedis.refreshToken.del).toHaveBeenCalledWith(VALID_ID);
  });

  it("404 — user not found", async () => {
    MockUser.findById = jest.fn().mockResolvedValue(null);
    const res = await request(app).patch(endpoint()).set("Authorization", `Bearer ${adminToken}`).send(validBody);
    expect(res.status).toBe(404);
  });

  it("400 — password too short", async () => {
    const res = await request(app).patch(endpoint()).set("Authorization", `Bearer ${adminToken}`).send({ password: "short" });
    expect(res.status).toBe(400);
  });

  it("400 — invalid ObjectId", async () => {
    const res = await request(app).patch(endpoint(INVALID_ID)).set("Authorization", `Bearer ${adminToken}`).send(validBody);
    expect(res.status).toBe(400);
  });

  it("401 — unauthenticated", async () => {
    const res = await request(app).patch(endpoint()).send(validBody);
    expect(res.status).toBe(401);
  });

  it("403 — non-admin", async () => {
    const res = await request(app).patch(endpoint()).set("Authorization", `Bearer ${userToken}`).send(validBody);
    expect(res.status).toBe(403);
  });
});
