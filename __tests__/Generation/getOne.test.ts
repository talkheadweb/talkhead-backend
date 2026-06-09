import request from "supertest";
import app from "@/app";
import GenerationModel from "@/App/Core/Generation/model";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { GenerationStatus } from "@/App/Core/Generation/const";

jest.mock("@/App/Core/Generation/model");
jest.mock("@/Utils/helper/jwtHelper");

const ENDPOINT   = "/api/v1/generations";
const mockUserId = "664f1b2c3e4a5b6c7d8e9f01";
const otherUserId= "664f1b2c3e4a5b6c7d8e9f99";
const mockGenId  = "664f1b2c3e4a5b6c7d8e9f00";

const MockModel = GenerationModel as jest.Mocked<typeof GenerationModel>;
const MockJwt   = JwtHelper       as jest.Mocked<typeof JwtHelper>;

const mockDoc = (userId = mockUserId) => ({
  _id   : mockGenId,
  userId,
  status: GenerationStatus.PENDING,
});

describe("GET /generations/:id", () => {
  beforeEach(() => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: mockUserId, email: "a@b.com", role: "user" });
  });

  it("200 — owner can fetch their own record", async () => {
    MockModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDoc()) }) as any;
    const res = await request(app).get(`${ENDPOINT}/${mockGenId}`).set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(mockGenId);
  });

  it("403 — non-owner cannot fetch another user's record", async () => {
    MockModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDoc(otherUserId)) }) as any;
    const res = await request(app).get(`${ENDPOINT}/${mockGenId}`).set("Authorization", "Bearer t");
    expect(res.status).toBe(403);
  });

  it("404 — record not found", async () => {
    MockModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) as any;
    const res = await request(app).get(`${ENDPOINT}/${mockGenId}`).set("Authorization", "Bearer t");
    expect(res.status).toBe(404);
  });

  it("401 — no token", async () => {
    const res = await request(app).get(`${ENDPOINT}/${mockGenId}`);
    expect(res.status).toBe(401);
  });

  it("200 — admin can fetch any record", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: "adminId", email: "admin@b.com", role: "admin" });
    MockModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDoc(otherUserId)) }) as any;
    const res = await request(app).get(`${ENDPOINT}/${mockGenId}`).set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
  });
});
