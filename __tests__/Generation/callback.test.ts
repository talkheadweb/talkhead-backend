import request from "supertest";
import app from "@/app";
import GenerationModel from "@/App/Core/Generation/model";
import { GenerationStatus } from "@/App/Core/Generation/const";
import config from "@/Config";

jest.mock("@/App/Core/Generation/model");
// @/Config/queue is mocked globally via jest.config moduleNameMapper

const ENDPOINT  = "/api/v1/generations";
const mockGenId = "664f1b2c3e4a5b6c7d8e9f00";

const MockModel = GenerationModel as jest.Mocked<typeof GenerationModel>;

const apiKey    = () => ({ "x-api-key": config.queue.api_key });

const makeDoc = (status = GenerationStatus.PROCESSING) => ({
  _id: mockGenId,
  status,
  lean: jest.fn().mockReturnThis(),
});

describe("POST /generations/:id/callback", () => {
  beforeEach(() => {
    MockModel.findById           = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(makeDoc()) }) as any;
    MockModel.findByIdAndUpdate  = jest.fn().mockResolvedValue({}) as any;
  });

  // ── Happy paths ────────────────────────────────────────────────────────────

  it("200 — success=true marks generation completed", async () => {
    const res = await request(app)
      .post(`${ENDPOINT}/${mockGenId}/callback`)
      .set(apiKey())
      .send({ success: true, outputUrl: "https://cdn.example.com/result.mp3" });

    expect(res.status).toBe(200);
    expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(
      mockGenId,
      expect.objectContaining({
        $set: expect.objectContaining({ status: GenerationStatus.COMPLETED }),
      }),
      expect.any(Object),
    );
  });

  it("200 — success=false marks generation failed", async () => {
    const res = await request(app)
      .post(`${ENDPOINT}/${mockGenId}/callback`)
      .set(apiKey())
      .send({ success: false });

    expect(res.status).toBe(200);
    expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(
      mockGenId,
      expect.objectContaining({
        $set: expect.objectContaining({ status: GenerationStatus.FAILED }),
      }),
    );
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it("400 — missing success field", async () => {
    const res = await request(app)
      .post(`${ENDPOINT}/${mockGenId}/callback`)
      .set(apiKey())
      .send({});

    expect(res.status).toBe(400);
  });

  it("400 — outputUrl not a valid URL", async () => {
    const res = await request(app)
      .post(`${ENDPOINT}/${mockGenId}/callback`)
      .set(apiKey())
      .send({ success: true, outputUrl: "not-a-url" });

    expect(res.status).toBe(400);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it("401 — missing API key", async () => {
    const res = await request(app)
      .post(`${ENDPOINT}/${mockGenId}/callback`)
      .send({ success: true });

    expect(res.status).toBe(401);
  });

  it("403 — wrong API key", async () => {
    const res = await request(app)
      .post(`${ENDPOINT}/${mockGenId}/callback`)
      .set({ "x-api-key": "wrong-key" })
      .send({ success: true });

    expect(res.status).toBe(403);
  });

  // ── Business errors ────────────────────────────────────────────────────────

  it("404 — generation not found", async () => {
    MockModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) as any;
    const res = await request(app)
      .post(`${ENDPOINT}/${mockGenId}/callback`)
      .set(apiKey())
      .send({ success: true });

    expect(res.status).toBe(404);
  });
});
