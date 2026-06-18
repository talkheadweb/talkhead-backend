import request from "supertest";
import path from "path";
import fs from "fs";
import app from "@/app";
import { adminToken, userToken, makeFileDoc } from "./_helpers";

jest.mock("@/App/File/model", () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
  },
}));

jest.mock("@/Utils/file/upload", () => ({
  ...jest.requireActual("@/Utils/file/upload"),
  generateR2Key : jest.fn().mockReturnValue("profiles/test-uuid.jpg"),
  uploadFileToR2: jest.fn().mockResolvedValue(undefined),
}));

import FileRecordModel from "@/App/File/model";

const ENDPOINT = "/api/v1/files/upload";

// Minimal 1×1 JPEG
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH" +
  "BwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAAR" +
  "CAABAAEDASIAAREBAXEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAP/" +
  "EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwABmX/9k=",
  "base64",
);

const TEMP_IMAGE = path.join(process.cwd(), "temp-uploads", "test-file-upload.jpg");
beforeAll(() => {
  fs.mkdirSync(path.dirname(TEMP_IMAGE), { recursive: true });
  fs.writeFileSync(TEMP_IMAGE, TINY_JPEG);
});
afterAll(() => { if (fs.existsSync(TEMP_IMAGE)) fs.unlinkSync(TEMP_IMAGE); });

describe("POST /files/upload", () => {
  beforeEach(() => {
    (FileRecordModel.create as jest.Mock).mockResolvedValue(makeFileDoc());
  });

  it("201 — profile_picture upload (any user)", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${userToken}`)
      .field("type", "profile_picture")
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
  });

  it("201 — avatar_image upload (admin)", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .field("type", "avatar_image")
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(201);
  });

  it("403 — avatar_image upload rejected for non-admin", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${userToken}`)
      .field("type", "avatar_image")
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(403);
  });

  it("400 — missing file", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${userToken}`)
      .field("type", "profile_picture");
    expect(res.status).toBe(400);
  });

  it("400 — missing type", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(400);
  });

  it("400 — invalid type value", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${userToken}`)
      .field("type", "bad_type")
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(400);
  });

  it("401 — no token", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .field("type", "profile_picture")
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(401);
  });
});
