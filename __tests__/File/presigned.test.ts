import request from "supertest";
import app from "@/app";
import { adminToken, makeFileDoc, VALID_ID } from "./_helpers";

jest.mock("@/App/File/model", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock("@/Utils/file/upload", () => ({
  ...jest.requireActual("@/Utils/file/upload"),
  getPresignedUrl: jest.fn().mockResolvedValue("https://r2.example.com/signed-url"),
}));

import FileRecordModel from "@/App/File/model";

const ENDPOINT = `/api/v1/files/${VALID_ID}/presigned`;

describe("GET /files/:id/presigned", () => {
  it("200 — returns presigned URL", async () => {
    (FileRecordModel.findById as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makeFileDoc()) });
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe("https://r2.example.com/signed-url");
  });

  it("404 — file not found", async () => {
    (FileRecordModel.findById as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("401 — no token", async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });
});
