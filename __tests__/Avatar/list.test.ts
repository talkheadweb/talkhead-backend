import request from "supertest";
import app from "@/app";
import { adminToken, userToken, makeAvatarDoc } from "./_helpers";

jest.mock("@/App/Avatar/model", () => ({
  __esModule: true,
  default: {
    find          : jest.fn(),
    countDocuments: jest.fn(),
    schema        : { path: jest.fn().mockReturnValue({ instance: "Boolean" }) },
  },
}));

import AvatarModel from "@/App/Avatar/model";

const ENDPOINT = "/api/v1/avatars";

const mockFind = (docs: object[]) => {
  (AvatarModel.find as jest.Mock).mockReturnValue({
    sort    : jest.fn().mockReturnThis(),
    skip    : jest.fn().mockReturnThis(),
    limit   : jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean    : jest.fn().mockResolvedValue(docs),
  });
};

describe("GET /avatars", () => {
  beforeEach(() => {
    mockFind([makeAvatarDoc(), makeAvatarDoc()]);
    (AvatarModel.countDocuments as jest.Mock).mockResolvedValue(2);
  });

  it("200 — user gets active avatars with meta", async () => {
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10, total: 2 });
  });

  it("200 — non-admin query always includes isActive:true filter", async () => {
    await request(app).get(ENDPOINT).set("Authorization", `Bearer ${userToken}`);
    expect(AvatarModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({ isActive: true }),
        ]),
      }),
    );
  });

  it("200 — admin with no filters passes empty query", async () => {
    await request(app).get(ENDPOINT).set("Authorization", `Bearer ${adminToken}`);
    expect(AvatarModel.find).toHaveBeenCalledWith({});
  });

  it("200 — respects page and limit", async () => {
    const res = await request(app)
      .get(`${ENDPOINT}?page=2&limit=5`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 5 });
  });

  it("401 — no token", async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });
});
