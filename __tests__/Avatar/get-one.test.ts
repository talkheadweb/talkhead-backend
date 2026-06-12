import request from "supertest";
import app from "@/app";
import { userToken, makeAvatarDoc, VALID_ID } from "./_helpers";

jest.mock("@/App/Avatar/model", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
  },
}));

import AvatarModel from "@/App/Avatar/model";

const ENDPOINT = "/api/v1/avatars";

describe("GET /avatars/:id", () => {
  it("200 — returns avatar", async () => {
    (AvatarModel.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makeAvatarDoc()) });
    const res = await request(app).get(`${ENDPOINT}/${VALID_ID}`).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(VALID_ID);
  });

  it("404 — not found (or inactive for non-admin)", async () => {
    (AvatarModel.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const res = await request(app).get(`${ENDPOINT}/${VALID_ID}`).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("401 — no token", async () => {
    const res = await request(app).get(`${ENDPOINT}/${VALID_ID}`);
    expect(res.status).toBe(401);
  });
});
