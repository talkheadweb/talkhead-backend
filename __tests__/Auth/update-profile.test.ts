import request from "supertest";
import jwt from "jsonwebtoken";
import app from "@/app";
import UserModel from "@/App/Auth/model";

jest.mock("@/App/Auth/model");
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    refreshToken     : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    verifyToken      : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    resetToken       : { set: jest.fn(), get: jest.fn(), del: jest.fn() },
    presignedUrlCache: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() },
  },
}));

// Mock R2 — prevents actual S3 calls
jest.mock("@/Utils/file/upload", () => ({
  uploadProfileImageToR2: jest.fn().mockResolvedValue({
    fileKey: "avatars/test-uuid.webp",
    fileUrl: "https://cdn.example.com/avatars/test-uuid.webp",
  }),
  deleteFromR2: jest.fn().mockResolvedValue(undefined),
}));

import { uploadProfileImageToR2 } from "@/Utils/file/upload";
const MockUser   = UserModel as jest.Mocked<typeof UserModel>;
const MockUpload = uploadProfileImageToR2 as jest.Mock;

const ENDPOINT = "/api/v1/auth/profile";

const authToken = jwt.sign(
  { uid: "user123", email: "test@example.com", role: "user" },
  "test-access-secret-32-chars-long!",
  { expiresIn: "15m" },
);

const makeDoc = (overrides = {}) => ({
  _id: "user123", name: "Test User", email: "test@example.com",
  role: "user", isVerified: true, profilePictureKey: null,
  toObject: () => ({ _id: "user123", name: "Test User", email: "test@example.com", role: "user", isVerified: true, profilePictureKey: null, ...overrides }),
  ...overrides,
});

describe("PATCH /auth/profile", () => {
  beforeEach(() => {
    MockUser.findById.mockResolvedValue(makeDoc() as any);
    MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(makeDoc({ name: "Updated" }));
  });

  // ── Name-only update (JSON) ────────────────────────────────────────────
  it("200 — updates name via JSON body", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(
      "user123",
      { $set: { name: "Updated Name" } },
      { new: true },
    );
  });

  // ── Picture upload (multipart) ─────────────────────────────────────────
  it("200 — uploads profile picture via multipart and stores R2 file key", async () => {
    MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(
      makeDoc({ profilePictureKey: "avatars/test-uuid.webp" }),
    );

    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .attach("profilePicture", Buffer.from("fake-image"), { filename: "avatar.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(MockUpload).toHaveBeenCalled();
  });

  it("200 — updates both name and picture in one request", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .field("name", "New Name")
      .attach("profilePicture", Buffer.from("fake-image"), { filename: "avatar.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(MockUser.findByIdAndUpdate).toHaveBeenCalledWith(
      "user123",
      expect.objectContaining({ $set: expect.objectContaining({ name: "New Name" }) }),
      { new: true },
    );
  });

  // ── Validation ─────────────────────────────────────────────────────────
  it("401 — no auth token", async () => {
    const res = await request(app).patch(ENDPOINT).send({ name: "Name" });
    expect(res.status).toBe(401);
  });

  it("400 — no fields and no file", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("400 — name too short", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "X" });
    expect(res.status).toBe(400);
  });

  it("404 — user not found", async () => {
    MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    MockUser.findById.mockResolvedValue(makeDoc() as any); // findById used for old picture cleanup

    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "Valid Name" });

    expect(res.status).toBe(404);
  });
});
