import request from "supertest";
import app from "@/app";
import GenerationModel from "@/App/Core/Generation/model";
import { JwtHelper } from "@/Utils/helper/jwtHelper";

jest.mock("@/App/Core/Generation/model");
jest.mock("@/Utils/helper/jwtHelper");

const ENDPOINT  = "/api/v1/generations";
const mockGenId = "664f1b2c3e4a5b6c7d8e9f00";

const MockModel = GenerationModel as jest.Mocked<typeof GenerationModel>;
const MockJwt   = JwtHelper       as jest.Mocked<typeof JwtHelper>;

describe("DELETE /generations/:id (admin only)", () => {
  beforeEach(() => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: "adminId", email: "admin@b.com", role: "admin" });
    MockModel.findByIdAndDelete = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: mockGenId }) }) as any;
    // service does findByIdAndDelete(...).lean() chain
  });

  it("200 — admin can delete a record", async () => {
    const res = await request(app).delete(`${ENDPOINT}/${mockGenId}`).set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
  });

  it("403 — regular user cannot delete", async () => {
    MockJwt.verifyAccessToken = jest.fn().mockReturnValue({ uid: "userId", email: "u@b.com", role: "user" });
    const res = await request(app).delete(`${ENDPOINT}/${mockGenId}`).set("Authorization", "Bearer t");
    expect(res.status).toBe(403);
  });

  it("404 — record not found", async () => {
    MockModel.findByIdAndDelete = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) as any;
    const res = await request(app).delete(`${ENDPOINT}/${mockGenId}`).set("Authorization", "Bearer t");
    expect(res.status).toBe(404);
  });

  it("401 — no token", async () => {
    const res = await request(app).delete(`${ENDPOINT}/${mockGenId}`);
    expect(res.status).toBe(401);
  });
});
