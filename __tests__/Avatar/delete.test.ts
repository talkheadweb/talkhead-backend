import request from "supertest";
import app from "@/app";
import { adminToken, userToken, makeAvatarDoc, VALID_ID } from "./_helpers";

jest.mock("@/App/Avatar/model", () => ({
  __esModule: true,
  default: {
    findByIdAndDelete: jest.fn(),
  },
}));

jest.mock("@/App/File/service", () => ({
  FileService: {
    deleteByOwner: jest.fn().mockResolvedValue(undefined),
  },
}));

import AvatarModel from "@/App/Avatar/model";

const ENDPOINT = `/api/v1/avatars/${VALID_ID}`;

describe("DELETE /avatars/:id", () => {
  it("200 — deletes avatar", async () => {
    (AvatarModel.findByIdAndDelete as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makeAvatarDoc()) });
    const res = await request(app)
      .delete(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Avatar deleted.");
  });

  it("404 — not found", async () => {
    (AvatarModel.findByIdAndDelete as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const res = await request(app)
      .delete(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("401 — no token", async () => {
    const res = await request(app).delete(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it("403 — non-admin", async () => {
    const res = await request(app)
      .delete(ENDPOINT)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});
