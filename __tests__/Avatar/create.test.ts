import request from "supertest";
import app from "@/app";
import path from "path";
import fs from "fs";
import { adminToken, userToken, makeAvatarDoc } from "./_helpers";

jest.mock("@/App/Avatar/model", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    create : jest.fn(),
    schema : { path: jest.fn().mockReturnValue({ instance: "String" }) },
  },
}));

jest.mock("@/Utils/file/upload", () => ({
  ...jest.requireActual("@/Utils/file/upload"),
  uploadGenericFile: jest.fn().mockResolvedValue({
    fileKey     : "avatars/test-uuid.jpg",
    fileUrl     : "https://cdn.example.com/avatars/test-uuid.jpg",
    mimeType    : "image/jpeg",
    fileSize    : 1024,
    originalName: "test.jpg",
  }),
}));

import AvatarModel from "@/App/Avatar/model";

const ENDPOINT = "/api/v1/avatars";

// Minimal 1×1 JPEG
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH" +
  "BwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAAR" +
  "CAABAAEDASIAAREBAXEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAP/" +
  "EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwABmX/9k=",
  "base64",
);

const TEMP_IMAGE = path.join(process.cwd(), "temp-uploads", "test-avatar-create.jpg");
beforeAll(() => { fs.mkdirSync(path.dirname(TEMP_IMAGE), { recursive: true }); fs.writeFileSync(TEMP_IMAGE, TINY_JPEG); });
afterAll(() => { if (fs.existsSync(TEMP_IMAGE)) fs.unlinkSync(TEMP_IMAGE); });

describe("POST /avatars", () => {
  beforeEach(() => {
    (AvatarModel.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    (AvatarModel.create as jest.Mock).mockResolvedValue(makeAvatarDoc());
  });

  it("201 — creates avatar with title and auto-generated slug", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .field("title", "Test Avatar")
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it("201 — creates avatar with explicit slug", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .field("title", "Test Avatar")
      .field("slug", "my-custom-slug")
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(201);
  });

  it("400 — missing file", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .field("title", "Test Avatar");
    expect(res.status).toBe(400);
  });

  it("400 — missing title", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(400);
  });

  it("409 — slug already exists", async () => {
    (AvatarModel.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makeAvatarDoc()) });
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .field("title", "Test Avatar")
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(409);
  });

  it("401 — missing token", async () => {
    const res = await request(app).post(ENDPOINT).field("title", "Test");
    expect(res.status).toBe(401);
  });

  it("403 — non-admin token", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set("Authorization", `Bearer ${userToken}`)
      .field("title", "Test")
      .attach("file", TEMP_IMAGE);
    expect(res.status).toBe(403);
  });
});
