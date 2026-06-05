import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { HashHelper } from "@/Utils/helper/hashHelper";
import { adminToken, mockUserDoc, userToken } from "./_helpers";

jest.mock("@/App/Auth/model");
jest.mock("@/Utils/helper/hashHelper");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: { refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn() } },
}));

const MockUser = UserModel  as jest.Mocked<typeof UserModel>;
const MockHash = HashHelper as jest.Mocked<typeof HashHelper>;
const ENDPOINT = "/api/v1/admin/users";
const validBody = { name: "New User", email: "new@example.com", password: "SecurePass1" };

describe("POST /admin/users", () => {
  beforeEach(() => {
    MockUser.findOne = jest.fn().mockResolvedValue(null);
    MockHash.generateHashPassword = jest.fn().mockResolvedValue("hashed");
    MockUser.create = jest.fn().mockResolvedValue(mockUserDoc({ email: "new@example.com" }));
  });

  it("201 — creates user", async () => {
    const res = await request(app).post(ENDPOINT).set("Authorization", `Bearer ${adminToken}`).send(validBody);
    expect(res.status).toBe(201);
    expect(MockUser.create).toHaveBeenCalledWith(expect.objectContaining({ email: "new@example.com", isVerified: true }));
  });

  it("201 — admin can set role to admin", async () => {
    MockUser.create = jest.fn().mockResolvedValue(mockUserDoc({ role: "admin" }));
    const res = await request(app).post(ENDPOINT).set("Authorization", `Bearer ${adminToken}`).send({ ...validBody, role: "admin" });
    expect(res.status).toBe(201);
    expect(MockUser.create).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }));
  });

  it("409 — duplicate email", async () => {
    MockUser.findOne = jest.fn().mockResolvedValue(mockUserDoc());
    const res = await request(app).post(ENDPOINT).set("Authorization", `Bearer ${adminToken}`).send(validBody);
    expect(res.status).toBe(409);
  });

  it("400 — missing required fields", async () => {
    const res = await request(app).post(ENDPOINT).set("Authorization", `Bearer ${adminToken}`).send({ name: "X" });
    expect(res.status).toBe(400);
  });

  it("400 — password too short", async () => {
    const res = await request(app).post(ENDPOINT).set("Authorization", `Bearer ${adminToken}`).send({ ...validBody, password: "short" });
    expect(res.status).toBe(400);
  });

  it("401 — unauthenticated", async () => {
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(401);
  });

  it("403 — non-admin", async () => {
    const res = await request(app).post(ENDPOINT).set("Authorization", `Bearer ${userToken}`).send(validBody);
    expect(res.status).toBe(403);
  });
});
