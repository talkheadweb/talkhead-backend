import request from "supertest";
import app from "@/app";
import { Types } from "mongoose";

jest.mock("@/Config/queue");

const ENDPOINT  = "/api/v1/queue";
const VALID_KEY = process.env.QUEUE_API_KEY ?? "test-api-key";
const mockId    = new Types.ObjectId().toHexString();

const { QueueJobModel } = jest.requireMock("@/Config/queue") as {
  QueueJobModel: { findById: jest.Mock };
};

const makeDoc = () => ({
  _id     : mockId,
  recordId: "REC-001",
  type    : "generation",
  status  : "pending",
  payload : {},
  attempts: 0,
});

describe("GET /queue/:id", () => {
  it("200 — returns job by id", async () => {
    QueueJobModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(makeDoc()) });
    const res = await request(app).get(`${ENDPOINT}/${mockId}`).set("x-api-key", VALID_KEY);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(mockId);
  });

  it("404 — job not found", async () => {
    QueueJobModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const res = await request(app).get(`${ENDPOINT}/${mockId}`).set("x-api-key", VALID_KEY);
    expect(res.status).toBe(404);
  });

  it("401 — missing API key", async () => {
    const res = await request(app).get(`${ENDPOINT}/${mockId}`);
    expect(res.status).toBe(401);
  });

  it("403 — wrong API key", async () => {
    const res = await request(app).get(`${ENDPOINT}/${mockId}`).set("x-api-key", "bad");
    expect(res.status).toBe(403);
  });
});
