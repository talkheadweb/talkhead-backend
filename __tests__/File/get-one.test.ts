import request from "supertest";
import app from "@/app";
import { adminToken, userToken, otherUserToken, makeFileDoc, VALID_ID } from "./_helpers";

jest.mock("@/App/File/model", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

import FileRecordModel from "@/App/File/model";

const ENDPOINT = `/api/v1/files/${VALID_ID}`;

describe("GET /files/:id", () => {
  it("200 — admin gets any file", async () => {
    (FileRecordModel.findById as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makeFileDoc()) });
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(VALID_ID);
  });

  it("200 — owner can get their own file", async () => {
    // userToken uid matches makeFileDoc uploadedBy (both are VALID_ID)
    (FileRecordModel.findById as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makeFileDoc()) });
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
  });

  it("404 — non-owner gets 404", async () => {
    (FileRecordModel.findById as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makeFileDoc()) });
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${otherUserToken}`);
    expect(res.status).toBe(404);
  });

  it("404 — not found", async () => {
    (FileRecordModel.findById as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("401 — no token", async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });
});
