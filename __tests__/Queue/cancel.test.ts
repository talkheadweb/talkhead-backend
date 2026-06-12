import request from "supertest";
import app from "@/app";
import { Types } from "mongoose";
import { QueueJobStatus, type TQueueJobStatus } from "@/Config/queue/const";

jest.mock("@/Config/queue");
jest.mock("@/App/Queue/model", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

import QueueJobModel from "@/App/Queue/model";

const ENDPOINT  = "/api/v1/queue";
const VALID_KEY = process.env.QUEUE_API_KEY ?? "test-api-key";
const mockId    = new Types.ObjectId().toHexString();

const makeDoc = (status: TQueueJobStatus = QueueJobStatus.PENDING) => ({
  _id     : mockId,
  recordId: "REC-001",
  status,
  save    : jest.fn().mockResolvedValue(undefined),
});

describe("DELETE /queue/:id", () => {
  it("200 — cancels a pending job", async () => {
    (QueueJobModel.findById as jest.Mock).mockResolvedValue(makeDoc());
    const res = await request(app).delete(`${ENDPOINT}/${mockId}`).set("x-api-key", VALID_KEY);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(QueueJobStatus.CANCELLED);
  });

  it("409 — cannot cancel a processing job", async () => {
    (QueueJobModel.findById as jest.Mock).mockResolvedValue(makeDoc(QueueJobStatus.PROCESSING));
    const res = await request(app).delete(`${ENDPOINT}/${mockId}`).set("x-api-key", VALID_KEY);
    expect(res.status).toBe(409);
  });

  it("409 — cannot cancel a completed job", async () => {
    (QueueJobModel.findById as jest.Mock).mockResolvedValue(makeDoc(QueueJobStatus.COMPLETED));
    const res = await request(app).delete(`${ENDPOINT}/${mockId}`).set("x-api-key", VALID_KEY);
    expect(res.status).toBe(409);
  });

  it("409 — already cancelled", async () => {
    (QueueJobModel.findById as jest.Mock).mockResolvedValue(makeDoc(QueueJobStatus.CANCELLED));
    const res = await request(app).delete(`${ENDPOINT}/${mockId}`).set("x-api-key", VALID_KEY);
    expect(res.status).toBe(409);
  });

  it("404 — job not found", async () => {
    (QueueJobModel.findById as jest.Mock).mockResolvedValue(null);
    const res = await request(app).delete(`${ENDPOINT}/${mockId}`).set("x-api-key", VALID_KEY);
    expect(res.status).toBe(404);
  });

  it("401 — missing API key", async () => {
    const res = await request(app).delete(`${ENDPOINT}/${mockId}`);
    expect(res.status).toBe(401);
  });
});
