import request from "supertest";
import app from "@/app";
import GenerationModel from "@/App/Core/Generation/model";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { GenerationStatus } from "@/App/Core/Generation/const";

jest.mock("@/App/Core/Generation/model");
jest.mock("@/Utils/helper/jwtHelper");

const ENDPOINT  = "/api/v1/generations";
const mockGenId = "664f1b2c3e4a5b6c7d8e9f00";
const adminId   = "664f000000000000000000aa";
const userId    = "664f000000000000000000bb";

const MockModel = GenerationModel as jest.Mocked<typeof GenerationModel>;
const MockJwt   = JwtHelper       as jest.Mocked<typeof JwtHelper>;

const ownedDoc = {
  _id   : mockGenId,
  userId: userId,
  status: GenerationStatus.COMPLETED,
  label : "My video",
  tags  : ["demo"],
};

describe("PATCH /generations/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockJwt.verifyAccessToken   = jest.fn().mockReturnValue({ uid: adminId, email: "admin@b.com", role: "admin" });
    MockModel.findByIdAndUpdate = jest.fn().mockResolvedValue(ownedDoc) as any;
    // label path: findById(...).lean() chain
    MockModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(ownedDoc) }) as any;
  });

  // ── Admin happy paths ──────────────────────────────────────────────────────

  it("200 — admin updates status and result fields", async () => {
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ status: GenerationStatus.COMPLETED, outputFileKey: "generations/output/uuid.mp4" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(GenerationStatus.COMPLETED);
  });

  it("200 — admin updates label and tags", async () => {
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ label: "Product demo", tags: ["demo", "v2"] });
    expect(res.status).toBe(200);
  });

  // ── User happy paths (label / tags on own generation) ─────────────────────

  it("200 — user updates label on own generation", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: userId, email: "u@b.com", role: "user" });
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ label: "My favourite take" });
    expect(res.status).toBe(200);
  });

  it("200 — user updates tags on own generation", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: userId, email: "u@b.com", role: "user" });
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ tags: ["launch", "q3"] });
    expect(res.status).toBe(200);
  });

  it("200 — user updates both label and tags on own generation", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: userId, email: "u@b.com", role: "user" });
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ label: "Take 3", tags: ["final"] });
    expect(res.status).toBe(200);
  });

  // ── Authorization ──────────────────────────────────────────────────────────

  it("403 — user sending admin-only fields (status) gets rejected", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: userId, email: "u@b.com", role: "user" });
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ status: GenerationStatus.COMPLETED });
    expect(res.status).toBe(403);
  });

  it("403 — user cannot update label on another user's generation", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: "differentUser", email: "other@b.com", role: "user" });
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ label: "Stolen label" });
    expect(res.status).toBe(403);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it("400 — invalid status value", async () => {
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ status: "not-a-status" });
    expect(res.status).toBe(400);
  });

  it("400 — empty body (no fields provided)", async () => {
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({});
    expect(res.status).toBe(400);
  });

  it("400 — label exceeds 100 chars", async () => {
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ label: "x".repeat(101) });
    expect(res.status).toBe(400);
  });

  it("400 — tags array exceeds 20 items", async () => {
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ tags: Array.from({ length: 21 }, (_, i) => `tag${i}`) });
    expect(res.status).toBe(400);
  });

  // ── Not found ──────────────────────────────────────────────────────────────

  it("404 — record not found (admin update)", async () => {
    MockModel.findByIdAndUpdate = jest.fn().mockResolvedValue(null) as any;
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ status: GenerationStatus.FAILED });
    expect(res.status).toBe(404);
  });

  it("404 — record not found (user label update)", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: userId, email: "u@b.com", role: "user" });
    MockModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) as any;
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ label: "Test" });
    expect(res.status).toBe(404);
  });

  // ── Unauthenticated ────────────────────────────────────────────────────────

  it("401 — no token", async () => {
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .send({ status: GenerationStatus.COMPLETED });
    expect(res.status).toBe(401);
  });
});
