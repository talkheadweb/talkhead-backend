import jwt from "jsonwebtoken";
import { Types } from "mongoose";

const ACCESS_SECRET = "test-access-secret-32-chars-long!";

export const VALID_ID = new Types.ObjectId().toHexString();

export const adminToken = jwt.sign(
  { uid: VALID_ID, email: "admin@test.com", role: "admin" },
  ACCESS_SECRET,
  { expiresIn: "15m" },
);

export const userToken = jwt.sign(
  { uid: new Types.ObjectId().toHexString(), email: "user@test.com", role: "user" },
  ACCESS_SECRET,
  { expiresIn: "15m" },
);

export const makeAvatarDoc = (overrides = {}) => ({
  _id      : VALID_ID,
  title    : "Test Avatar",
  slug     : "test-avatar",
  fileKey  : "avatars/test-uuid.jpg",
  file     : {
    _id         : new Types.ObjectId().toHexString(),
    fileUrl     : "https://cdn.example.com/avatars/test-uuid.jpg",
    mimeType    : "image/jpeg",
    fileSize    : 1024,
    originalName: "test.jpg",
    folder      : "avatars",
  },
  isActive : true,
  createdBy: VALID_ID,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});
