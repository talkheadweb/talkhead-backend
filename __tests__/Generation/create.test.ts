import request from "supertest";
import app from "@/app";
import GenerationModel from "@/App/Core/Generation/model";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { GenerationStatus, GenerationInputType, GenerationOutputType } from "@/App/Core/Generation/const";

jest.mock("@/App/Core/Generation/model");
jest.mock("@/Utils/helper/jwtHelper");
// QueueUtil is mocked globally via jest.config moduleNameMapper

const ENDPOINT    = "/api/v1/generations";
const mockUserId  = "664f1b2c3e4a5b6c7d8e9f01";
const mockGenId   = "664f1b2c3e4a5b6c7d8e9f00";
const validBody   = {
  inputType : GenerationInputType.TEXT,
  outputType: GenerationOutputType.AUDIO,
  inputText : "Generate a calming audio about nature.",
};

const MockModel = GenerationModel as jest.Mocked<typeof GenerationModel>;
const MockJwt   = JwtHelper       as jest.Mocked<typeof JwtHelper>;

const makeDoc = (overrides = {}) => ({
  _id      : mockGenId,
  userId   : mockUserId,
  bullJobId: "42",
  status   : GenerationStatus.PENDING,
  ...validBody,
  save     : jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const authHeaders = () => ({ Authorization: "Bearer valid-token" });

describe("POST /generations", () => {
  beforeEach(() => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: mockUserId, email: "a@b.com", role: "user" });
    MockModel.create = jest.fn().mockResolvedValue(makeDoc()) as any;
  });

  it("201 — creates a generation job and returns the record", async () => {
    const res = await request(app).post(ENDPOINT).set(authHeaders()).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: GenerationStatus.PENDING });
    expect(MockModel.create).toHaveBeenCalledTimes(1);
  });

  it("400 — missing required inputType", async () => {
    const { inputType: _, ...body } = validBody;
    const res = await request(app).post(ENDPOINT).set(authHeaders()).send(body);
    expect(res.status).toBe(400);
  });

  it("400 — missing required outputType", async () => {
    const { outputType: _, ...body } = validBody;
    const res = await request(app).post(ENDPOINT).set(authHeaders()).send(body);
    expect(res.status).toBe(400);
  });

  it("401 — no token", async () => {
    const res = await request(app).post(ENDPOINT).send(validBody);
    expect(res.status).toBe(401);
  });
});
