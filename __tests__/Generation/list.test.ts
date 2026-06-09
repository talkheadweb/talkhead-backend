import request from "supertest";
import app from "@/app";
import GenerationModel from "@/App/Core/Generation/model";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import { GenerationStatus } from "@/App/Core/Generation/const";

jest.mock("@/App/Core/Generation/model");
jest.mock("@/Utils/helper/jwtHelper");

const ENDPOINT   = "/api/v1/generations";
const mockUserId = "664f1b2c3e4a5b6c7d8e9f01";

const MockModel = GenerationModel as jest.Mocked<typeof GenerationModel>;
const MockJwt   = JwtHelper       as jest.Mocked<typeof JwtHelper>;

const mockDocs = [
  { _id: "id1", userId: mockUserId, status: GenerationStatus.PENDING },
  { _id: "id2", userId: mockUserId, status: GenerationStatus.COMPLETED },
];

const setupModelList = () => {
  const sortMock  = jest.fn().mockReturnThis();
  const skipMock  = jest.fn().mockReturnThis();
  const limitMock = jest.fn().mockReturnThis();
  const leanMock  = jest.fn().mockResolvedValue(mockDocs);
  MockModel.find = jest.fn().mockReturnValue({ sort: sortMock, skip: skipMock, limit: limitMock, lean: leanMock }) as any;
  MockModel.countDocuments = jest.fn().mockResolvedValue(2) as any;
};

describe("GET /generations", () => {
  beforeEach(() => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: mockUserId, email: "a@b.com", role: "user" });
    setupModelList();
  });

  it("200 — returns paginated list", async () => {
    const res = await request(app).get(ENDPOINT).set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ total: 2 });
  });

  it("401 — no token", async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });
});
