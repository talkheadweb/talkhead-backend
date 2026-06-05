import request from "supertest";
import app from "@/app";
import UserModel from "@/App/Auth/model";
import { adminToken, mockUserDoc, userToken } from "./_helpers";

// Preserve the real Mongoose schema so buildSchemaFilterConditions can introspect
// field types at test-time — only mock DB methods, not the schema definition.
jest.mock("@/App/Auth/model", () => {
  const actual = jest.requireActual("@/App/Auth/model");
  return {
    __esModule: true,
    default: {
      find          : jest.fn(),
      countDocuments: jest.fn(),
      schema        : actual.default.schema,
    },
  };
});
jest.mock("@/App/Auth/redisService", () => ({
  AuthRedisService: {
    refreshToken: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
  },
}));

const MockUser = UserModel as jest.Mocked<typeof UserModel>;
const ENDPOINT = "/api/v1/admin/users";
const docs     = [mockUserDoc(), mockUserDoc({ email: "b@example.com" })];

describe("GET /admin/users", () => {
  beforeEach(() => {
    MockUser.find        = jest.fn().mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve(docs) }) }) }) });
    MockUser.countDocuments = jest.fn().mockResolvedValue(2);
  });

  it("200 — returns paginated user list for admin", async () => {
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10, total: 2, totalPages: 1 });
  });

  it("200 — supports search query param and discrete filters", async () => {
    await request(app)
      .get(`${ENDPOINT}?search=alice&role=user&isVerified=true&isActive=true`)
      .set("Authorization", `Bearer ${adminToken}`);
    // Service builds a $and array: [{ $or: [...] }, { role: ... }, { isVerified: ... }, { isActive: ... }]
    expect(MockUser.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({ $or: expect.any(Array) }),       // search condition
          expect.objectContaining({ role: expect.any(Object) }),     // MongoQueryHelper String → regex
          expect.objectContaining({ isVerified: true }),
          expect.objectContaining({ isActive: true }),
        ]),
      }),
    );
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it("403 — rejects non-admin user", async () => {
    const res = await request(app).get(ENDPOINT).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});
