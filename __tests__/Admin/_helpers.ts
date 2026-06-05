// Shared test helpers for Admin tests
import jwt from "jsonwebtoken";

export const VALID_ID   = "507f1f77bcf86cd799439011";
export const INVALID_ID = "not-an-object-id";

export const adminToken = jwt.sign(
  { uid: VALID_ID, email: "admin@example.com", role: "admin" },
  "test-access-secret-32-chars-long!",
  { expiresIn: "15m" },
);

export const userToken = jwt.sign(
  { uid: "507f1f77bcf86cd799439022", email: "user@example.com", role: "user" },
  "test-access-secret-32-chars-long!",
  { expiresIn: "15m" },
);

export const mockUserDoc = (overrides: Record<string, unknown> = {}) => ({
  _id           : VALID_ID,
  name          : "Test User",
  email         : "test@example.com",
  role          : "user",
  isVerified    : true,
  isActive      : true,
  profilePicture: null,
  createdAt     : new Date().toISOString(),
  updatedAt     : new Date().toISOString(),
  toObject() { return { ...this }; },
  ...overrides,
});
