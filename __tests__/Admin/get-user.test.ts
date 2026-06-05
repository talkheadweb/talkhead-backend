import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { adminToken, INVALID_ID, mockUserDoc, userToken, VALID_ID } from "./_helpers";

jest.mock("@/App/Auth/model");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: { refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn() } },
}));

const MockUser = UserModel as jest.Mocked<typeof UserModel>;
const endpoint = (id = VALID_ID) => `/api/v1/admin/users/${id}`;

describe("GET /admin/users/:id", () => {
  beforeEach(() => {
    MockUser.findById = jest.fn().mockResolvedValue(mockUserDoc());
  });

  it("200 — returns user for admin", async () => {
    const res = await request(app).get(endpoint()).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(VALID_ID);
  });

  it("404 — user not found", async () => {
    MockUser.findById = jest.fn().mockResolvedValue(null);
    const res = await request(app).get(endpoint()).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("400 — invalid ObjectId", async () => {
    const res = await request(app).get(endpoint(INVALID_ID)).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("401 — unauthenticated", async () => {
    const res = await request(app).get(endpoint());
    expect(res.status).toBe(401);
  });

  it("403 — non-admin", async () => {
    const res = await request(app).get(endpoint()).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});
