import request from "supertest";
import jwt from "jsonwebtoken";
import app from "@/app";
import UserModel from "@/App/Auth/model";

jest.mock("@/App/Auth/model");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    verifyToken : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    resetToken  : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

const MockUser = UserModel as jest.Mocked<typeof UserModel>;

const ENDPOINT = "/api/v1/auth/me";

// Sign with the test secret defined in jest.setup.ts
const authToken = jwt.sign(
  { uid: "user123", email: "test@example.com", role: "user" },
  "test-access-secret-32-chars-long!",
  { expiresIn: "15m" },
);

const userDoc = {
  _id: "user123", name: "Test User", email: "test@example.com",
  role: "user", isVerified: true, profilePictureKey: null,
  toObject: () => ({ _id: "user123", name: "Test User", email: "test@example.com", role: "user", isVerified: true, profilePicture: null }),
};

describe("GET /auth/me", () => {
  beforeEach(() => {
    MockUser.findById.mockResolvedValue(userDoc as any);
  });

  it("200 — returns user profile", async () => {
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("test@example.com");
    expect(res.body.data).not.toHaveProperty("password");
  });

  it("401 — no Authorization header", async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it("401 — malformed token", async () => {
    const res = await request(app).get(ENDPOINT).set("Authorization", "Bearer bad.token.here");
    expect(res.status).toBe(401);
  });

  it("401 — expired token", async () => {
    const expired = jwt.sign({ uid: "user123", email: "test@example.com", role: "user" }, "test-access-secret-32-chars-long!", { expiresIn: -1 });
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("401 — wrong scheme (no Bearer prefix)", async () => {
    const res = await request(app).get(ENDPOINT).set("Authorization", authToken);
    expect(res.status).toBe(401);
  });

  it("404 — user not found in DB", async () => {
    MockUser.findById.mockResolvedValue(null);
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });
});
