import request from "supertest";
import app from "@/app";
import GenerationModel from "@/App/Core/Generation/model";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { GenerationStatus } from "@/App/Core/Generation/const";

jest.mock("@/App/Core/Generation/model");
jest.mock("@/Utils/helper/jwtHelper");

const ENDPOINT   = "/api/v1/generations";
const mockGenId  = "664f1b2c3e4a5b6c7d8e9f00";

const MockModel = GenerationModel as jest.Mocked<typeof GenerationModel>;
const MockJwt   = JwtHelper       as jest.Mocked<typeof JwtHelper>;

const updatedDoc = { _id: mockGenId, status: GenerationStatus.COMPLETED, outputFileKey: "generations/output/uuid.mp3" };

describe("PATCH /generations/:id (admin update)", () => {
  beforeEach(() => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: "adminId", email: "admin@b.com", role: "admin" });
    MockModel.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedDoc) as any;
  });

  it("200 — admin can update status and result fields", async () => {
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ status: GenerationStatus.COMPLETED, outputFileKey: "generations/output/uuid.mp3" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(GenerationStatus.COMPLETED);
  });

  it("403 — regular user cannot update", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: "userId", email: "u@b.com", role: "user" });
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ status: GenerationStatus.COMPLETED });
    expect(res.status).toBe(403);
  });

  it("400 — invalid status value", async () => {
    const res = await request(app)
      .patch(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t")
      .send({ status: "invalid-status" });
    expect(res.status).toBe(400);
  });

  it("401 — no token", async () => {
    const res = await request(app).patch(`${ENDPOINT}/${mockGenId}`).send({ status: GenerationStatus.COMPLETED });
    expect(res.status).toBe(401);
  });
});
