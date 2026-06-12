import request from "supertest";
import app from "@/app";
import { adminToken, userToken, makeAvatarDoc, VALID_ID } from "./_helpers";

jest.mock("@/App/Avatar/model", () => ({
  __esModule: true,
  default: {
    findOne          : jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    findByIdAndUpdate: jest.fn(),
  },
}));

import AvatarModel from "@/App/Avatar/model";

const ENDPOINT = `/api/v1/avatars/${VALID_ID}`;

describe("PATCH /avatars/:id", () => {
  beforeEach(() => {
    (AvatarModel.findByIdAndUpdate as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makeAvatarDoc()) });
    (AvatarModel.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  });

  it("200 — updates title", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "New Title" });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it("200 — deactivates avatar", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);
  });

  it("400 — empty body", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("400 — invalid slug format", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ slug: "INVALID SLUG!" });
    expect(res.status).toBe(400);
  });

  it("404 — not found", async () => {
    (AvatarModel.findByIdAndUpdate as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "X" });
    expect(res.status).toBe(404);
  });

  it("409 — slug conflict with another avatar", async () => {
    (AvatarModel.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makeAvatarDoc()) });
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ slug: "existing-slug" });
    expect(res.status).toBe(409);
  });

  it("401 — no token", async () => {
    const res = await request(app).patch(ENDPOINT).send({ title: "X" });
    expect(res.status).toBe(401);
  });

  it("403 — non-admin", async () => {
    const res = await request(app)
      .patch(ENDPOINT)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ title: "X" });
    expect(res.status).toBe(403);
  });
});
