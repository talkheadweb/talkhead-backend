import request from "supertest";
import app from "@/app";
import GenerationModel from "@/App/Core/Generation/model";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { GenerationStatus, GenerationInputType } from "@/App/Core/Generation/const";

jest.mock("@/App/Core/Generation/model");
jest.mock("@/Utils/helper/jwtHelper");
jest.mock("@/Utils/file/upload", () => ({
  generateR2Key  : jest.fn().mockReturnValue("generations/images/mock-key.jpg"),
  uploadFileToR2 : jest.fn().mockResolvedValue(undefined),
  getPresignedUrl: jest.fn().mockResolvedValue("https://cdn.example.com/signed"),
}));
// @/Config/queue is mocked globally via jest.config moduleNameMapper

const ENDPOINT   = "/api/v1/generations";
const mockUserId = "664f1b2c3e4a5b6c7d8e9f01";
const mockGenId  = "664f1b2c3e4a5b6c7d8e9f00";

const MockModel = GenerationModel as jest.Mocked<typeof GenerationModel>;
const MockJwt   = JwtHelper       as jest.Mocked<typeof JwtHelper>;

const makeDoc = (overrides = {}) => ({
  _id           : mockGenId,
  userId        : mockUserId,
  status        : GenerationStatus.PENDING,
  inputType     : GenerationInputType.TEXT,
  voiceId       : "af_heart",
  referenceImage: "generations/images/mock-key.jpg",
  inputText     : "Say this calmly.",
  save          : jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const auth = () => ({ Authorization: "Bearer valid-token" });

describe("POST /generations", () => {
  beforeEach(() => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({
      uid: mockUserId, email: "a@b.com", role: "user",
    });
    MockModel.create               = jest.fn().mockResolvedValue(makeDoc()) as any;
    MockModel.findByIdAndUpdate    = jest.fn().mockResolvedValue(makeDoc()) as any;
  });

  // ── Happy paths ────────────────────────────────────────────────────────────

  it("201 — text job with referenceImageUrl (URL path, no file upload)", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set(auth())
      .field("inputType",        GenerationInputType.TEXT)
      .field("voiceId",          "af_heart")
      .field("inputText",        "Say this calmly.")
      .field("referenceImageUrl","https://example.com/ref.jpg");

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: GenerationStatus.PENDING });
    expect(MockModel.create).toHaveBeenCalledTimes(1);
  });

  it("201 — text job with referenceImage file upload", async () => {
    const fakeImage = Buffer.alloc(100, 0xff);
    const res = await request(app)
      .post(ENDPOINT)
      .set(auth())
      .field("inputType", GenerationInputType.TEXT)
      .field("voiceId",   "af_heart")
      .field("inputText", "Say this.")
      .attach("referenceImage", fakeImage, { filename: "ref.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(201);
    expect(MockModel.create).toHaveBeenCalledTimes(1);
  });

  it("201 — audio job with referenceImageUrl + inputAudio file", async () => {
    const fakeAudio = Buffer.alloc(100, 0xab);
    const res = await request(app)
      .post(ENDPOINT)
      .set(auth())
      .field("inputType",         GenerationInputType.AUDIO)
      .field("voiceId",           "af_heart")
      .field("referenceImageUrl", "https://example.com/ref.jpg")
      .attach("inputAudio", fakeAudio, { filename: "clip.mp3", contentType: "audio/mpeg" });

    expect(res.status).toBe(201);
    expect(MockModel.create).toHaveBeenCalledTimes(1);
  });

  // ── Validation failures ────────────────────────────────────────────────────

  it("400 — missing referenceImage (no file and no referenceImageUrl)", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set(auth())
      .field("inputType", GenerationInputType.TEXT)
      .field("voiceId",   "af_heart")
      .field("inputText", "Hello.");

    expect(res.status).toBe(400);
  });

  it("400 — missing voiceId", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set(auth())
      .field("inputType",         GenerationInputType.TEXT)
      .field("inputText",         "Hello.")
      .field("referenceImageUrl", "https://example.com/ref.jpg");

    expect(res.status).toBe(400);
  });

  it("400 — inputType=text but no inputText", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set(auth())
      .field("inputType",         GenerationInputType.TEXT)
      .field("voiceId",           "af_heart")
      .field("referenceImageUrl", "https://example.com/ref.jpg");

    expect(res.status).toBe(400);
  });

  it("400 — inputType=audio but no inputAudio file", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set(auth())
      .field("inputType",         GenerationInputType.AUDIO)
      .field("voiceId",           "af_heart")
      .field("referenceImageUrl", "https://example.com/ref.jpg");

    expect(res.status).toBe(400);
  });

  it("400 — invalid inputType value", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set(auth())
      .field("inputType",         "video")
      .field("voiceId",           "af_heart")
      .field("referenceImageUrl", "https://example.com/ref.jpg");

    expect(res.status).toBe(400);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it("401 — no token", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .field("inputType",         GenerationInputType.TEXT)
      .field("voiceId",           "af_heart")
      .field("inputText",         "Hello.")
      .field("referenceImageUrl", "https://example.com/ref.jpg");

    expect(res.status).toBe(401);
  });
});
