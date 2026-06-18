import request from "supertest";
import app from "@/app";
import GenerationModel from "@/App/Core/Generation/model";
import FileRecordModel from "@/App/File/model";
import * as upload from "@/Utils/file/upload";
import { JwtHelper } from "@/Utils/helper/jwtHelper";

jest.mock("@/App/Core/Generation/model");
jest.mock("@/App/File/model");
jest.mock("@/Utils/file/upload");
jest.mock("@/Utils/helper/jwtHelper");

const ENDPOINT  = "/api/v1/generations";
const mockGenId = "664f1b2c3e4a5b6c7d8e9f00";
const adminId   = "664f000000000000000000aa";
const userId    = "664f000000000000000000bb";

const MockModel      = GenerationModel as jest.Mocked<typeof GenerationModel>;
const MockFileRecord = FileRecordModel as jest.Mocked<typeof FileRecordModel>;
const MockJwt        = JwtHelper       as jest.Mocked<typeof JwtHelper>;
const mockDeleteR2   = upload.deleteFromR2 as jest.Mock;

// A generation owned by `userId` — has an uploaded avatar and an output file
const ownedDoc = {
  _id            : mockGenId,
  userId         : userId,
  status         : "completed",
  avatarImageKey : "generations/images/uuid.jpg",
  outputFileKey  : "generations/output/uuid.mp4",
  avatarImageFile: "664f000000000000000000cc",  // owned — will be cleaned
  outputFile     : "664f000000000000000000dd",
};

describe("DELETE /generations/:id (owner or admin)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockJwt.verifyAccessToken   = jest.fn().mockReturnValue({ uid: adminId, email: "admin@b.com", role: "admin" });
    MockModel.findById          = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(ownedDoc) }) as any;
    MockModel.findByIdAndDelete = jest.fn().mockResolvedValue(ownedDoc) as any;
    MockFileRecord.deleteMany   = jest.fn().mockResolvedValue({}) as any;
    mockDeleteR2.mockResolvedValue(undefined);
  });

  // ── Happy paths ────────────────────────────────────────────────────────────

  it("200 — admin can delete any record", async () => {
    const res = await request(app)
      .delete(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(MockModel.findByIdAndDelete).toHaveBeenCalledWith(mockGenId);
  });

  it("200 — owner (user) can delete their own record", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: userId, email: "u@b.com", role: "user" });
    const res = await request(app)
      .delete(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
  });

  it("cleans up owned R2 files and FileRecords on delete", async () => {
    await request(app)
      .delete(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t");

    // avatarImageKey deleted from R2 (avatarImageFile ref is set → generation owns it)
    expect(mockDeleteR2).toHaveBeenCalledWith(ownedDoc.avatarImageKey);
    // outputFileKey always deleted from R2
    expect(mockDeleteR2).toHaveBeenCalledWith(ownedDoc.outputFileKey);
    // FileRecords bulk-deleted by ObjectId refs
    expect(MockFileRecord.deleteMany).toHaveBeenCalled();
  });

  it("does not delete avatar R2 when avatarImageFile ref is absent (shared avatar key)", async () => {
    MockModel.findById = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ...ownedDoc, avatarImageFile: undefined }),
    }) as any;

    await request(app)
      .delete(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t");

    // Shared avatar key must NOT be deleted from R2
    expect(mockDeleteR2).not.toHaveBeenCalledWith(ownedDoc.avatarImageKey);
    // Output is always cleaned up
    expect(mockDeleteR2).toHaveBeenCalledWith(ownedDoc.outputFileKey);
  });

  // ── Authorization ──────────────────────────────────────────────────────────

  it("403 — user cannot delete another user's generation", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: "differentUser", email: "other@b.com", role: "user" });
    const res = await request(app)
      .delete(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(403);
  });

  // ── Not found ──────────────────────────────────────────────────────────────

  it("404 — record not found", async () => {
    MockModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) as any;
    const res = await request(app)
      .delete(`${ENDPOINT}/${mockGenId}`)
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(404);
  });

  // ── Unauthenticated ────────────────────────────────────────────────────────

  it("401 — no token", async () => {
    const res = await request(app).delete(`${ENDPOINT}/${mockGenId}`);
    expect(res.status).toBe(401);
  });
});
