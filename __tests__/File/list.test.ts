import request from "supertest";
import app from "@/app";
import { adminToken, userToken, makeFileDoc } from "./_helpers";

jest.mock("@/App/File/model", () => ({
  __esModule: true,
  default: {
    find          : jest.fn(),
    countDocuments: jest.fn(),
    schema        : { path: jest.fn().mockReturnValue({ instance: "String" }) },
  },
}));

import FileRecordModel from "@/App/File/model";

const ENDPOINT = "/api/v1/files";

const mockFind = (docs: object[]) => {
  (FileRecordModel.find as jest.Mock).mockReturnValue({
    sort : jest.fn().mockReturnThis(),
    skip : jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean : jest.fn().mockResolvedValue(docs),
  });
};

describe("GET /files", () => {
  beforeEach(() => {
    mockFind([makeFileDoc(), makeFileDoc()]);
    (FileRecordModel.countDocuments as jest.Mock).mockResolvedValue(2);
  });

  it("200 — admin gets all files with meta", async () => {
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10, total: 2 });
  });

  it("200 — user sees only own files (uploadedBy filter injected)", async () => {
    await request(app).get(ENDPOINT).set("Authorization", `Bearer ${userToken}`);
    expect(FileRecordModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({ uploadedBy: expect.anything() }),
        ]),
      }),
    );
  });

  it("200 — respects page and limit", async () => {
    const res = await request(app)
      .get(`${ENDPOINT}?page=2&limit=5`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 5 });
  });

  it("401 — no token", async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });
});
