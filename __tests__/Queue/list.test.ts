import request from "supertest";
import app from "@/app";

jest.mock("@/Config/queue");
jest.mock("@/App/Queue/model", () => ({
  __esModule: true,
  default: {
    find          : jest.fn(),
    countDocuments: jest.fn(),
    schema        : { path: jest.fn().mockReturnValue({ instance: "String" }) },
  },
}));

import QueueJobModel from "@/App/Queue/model";

const ENDPOINT   = "/api/v1/queue";
const VALID_KEY  = process.env.QUEUE_API_KEY ?? "test-api-key";

const makeDocs = (n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    _id      : `doc${i}`,
    recordId : `REC-${i}`,
    bullJobId: `bull-${i}`,
    type     : "generation",
    status   : "pending",
    payload  : {},
    attempts : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

const mockFind = (docs: ReturnType<typeof makeDocs>) => {
  (QueueJobModel.find as jest.Mock).mockReturnValue({
    sort : jest.fn().mockReturnThis(),
    skip : jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean : jest.fn().mockResolvedValue(docs),
  });
};

describe("GET /queue", () => {
  beforeEach(() => {
    mockFind(makeDocs(2));
    (QueueJobModel.countDocuments as jest.Mock).mockResolvedValue(2);
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it("200 — returns paginated list with data and meta", async () => {
    const res = await request(app).get(ENDPOINT).set("x-api-key", VALID_KEY);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10, total: 2, totalPages: 1 });
  });

  it("200 — empty list when no jobs exist", async () => {
    mockFind([]);
    (QueueJobModel.countDocuments as jest.Mock).mockResolvedValue(0);
    const res = await request(app).get(ENDPOINT).set("x-api-key", VALID_KEY);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta).toMatchObject({ total: 0, totalPages: 0 });
  });

  // ── Query parameters ────────────────────────────────────────────────────

  it("200 — respects page and limit params", async () => {
    const res = await request(app)
      .get(`${ENDPOINT}?page=2&limit=5`)
      .set("x-api-key", VALID_KEY);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 5 });
  });

  it("200 — passes status filter to MongoDB query", async () => {
    await request(app)
      .get(`${ENDPOINT}?status=failed`)
      .set("x-api-key", VALID_KEY);
    expect(QueueJobModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({ status: expect.any(Object) }),
        ]),
      }),
    );
  });

  it("200 — passes type filter to MongoDB query", async () => {
    await request(app)
      .get(`${ENDPOINT}?type=generation`)
      .set("x-api-key", VALID_KEY);
    expect(QueueJobModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({ type: expect.any(Object) }),
        ]),
      }),
    );
  });

  it("200 — passes search to MongoDB $or query", async () => {
    await request(app)
      .get(`${ENDPOINT}?search=REC-1`)
      .set("x-api-key", VALID_KEY);
    expect(QueueJobModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({ $or: expect.any(Array) }),
        ]),
      }),
    );
  });

  it("200 — no filter object when no params passed", async () => {
    await request(app).get(ENDPOINT).set("x-api-key", VALID_KEY);
    expect(QueueJobModel.find).toHaveBeenCalledWith({});
  });

  // ── Auth ────────────────────────────────────────────────────────────────

  it("401 — missing API key", async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it("403 — wrong API key", async () => {
    const res = await request(app).get(ENDPOINT).set("x-api-key", "wrong-key");
    expect(res.status).toBe(403);
  });
});
