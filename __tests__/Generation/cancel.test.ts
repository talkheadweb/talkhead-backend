import request from "supertest";
import app from "@/app";
import GenerationModel from "@/App/Core/Generation/model";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { GenerationStatus } from "@/App/Core/Generation/const";

jest.mock("@/App/Core/Generation/model");
jest.mock("@/Utils/helper/jwtHelper");
// QueueUtil is mocked globally

const ENDPOINT   = "/api/v1/generations";
const mockUserId = "664f1b2c3e4a5b6c7d8e9f01";
const otherUserId= "664f1b2c3e4a5b6c7d8e9f99";
const mockGenId  = "664f1b2c3e4a5b6c7d8e9f00";

const MockModel = GenerationModel as jest.Mocked<typeof GenerationModel>;
const MockJwt   = JwtHelper       as jest.Mocked<typeof JwtHelper>;

const makeDoc = (status: string = GenerationStatus.PENDING, userId = mockUserId) => ({
  _id   : mockGenId,
  userId,
  status,
  save  : jest.fn().mockResolvedValue(undefined),
});

describe("PATCH /generations/:id/cancel", () => {
  beforeEach(() => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: mockUserId, email: "a@b.com", role: "user" });
  });

  it("200 — owner can cancel a pending job", async () => {
    MockModel.findById = jest.fn().mockResolvedValue(makeDoc()) as any;
    const res = await request(app).patch(`${ENDPOINT}/${mockGenId}/cancel`).set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(GenerationStatus.CANCELLED);
  });

  it("409 — cannot cancel a completed job", async () => {
    MockModel.findById = jest.fn().mockResolvedValue(makeDoc(GenerationStatus.COMPLETED)) as any;
    const res = await request(app).patch(`${ENDPOINT}/${mockGenId}/cancel`).set("Authorization", "Bearer t");
    expect(res.status).toBe(409);
  });

  it("403 — non-owner cannot cancel another user's job", async () => {
    MockModel.findById = jest.fn().mockResolvedValue(makeDoc(GenerationStatus.PENDING, otherUserId)) as any;
    const res = await request(app).patch(`${ENDPOINT}/${mockGenId}/cancel`).set("Authorization", "Bearer t");
    expect(res.status).toBe(403);
  });

  it("404 — not found", async () => {
    MockModel.findById = jest.fn().mockResolvedValue(null) as any;
    const res = await request(app).patch(`${ENDPOINT}/${mockGenId}/cancel`).set("Authorization", "Bearer t");
    expect(res.status).toBe(404);
  });

  it("401 — no token", async () => {
    const res = await request(app).patch(`${ENDPOINT}/${mockGenId}/cancel`);
    expect(res.status).toBe(401);
  });
});
