import jwt from "jsonwebtoken";
import { Types } from "mongoose";

const ACCESS_SECRET = "test-access-secret-32-chars-long!";

export const VALID_ID    = new Types.ObjectId().toHexString();
export const OWNER_ID    = new Types.ObjectId().toHexString();

export const adminToken = jwt.sign(
  { uid: VALID_ID, email: "admin@test.com", role: "admin" },
  ACCESS_SECRET,
  { expiresIn: "15m" },
);

export const userToken = jwt.sign(
  { uid: VALID_ID, email: "user@test.com", role: "user" },
  ACCESS_SECRET,
  { expiresIn: "15m" },
);

export const otherUserToken = jwt.sign(
  { uid: new Types.ObjectId().toHexString(), email: "other@test.com", role: "user" },
  ACCESS_SECRET,
  { expiresIn: "15m" },
);

export const makeFileDoc = (overrides = {}) => {
  const base = {
    _id         : VALID_ID,
    type        : "avatar_image",
    folder      : "avatars",
    fileKey     : "avatars/test-uuid.jpg",
    fileUrl     : "https://cdn.example.com/avatars/test-uuid.jpg",
    originalName: "test.jpg",
    mimeType    : "image/jpeg",
    fileSize    : 10240,
    uploadedBy  : VALID_ID,
    ownerId     : OWNER_ID,
    createdAt   : new Date().toISOString(),
    updatedAt   : new Date().toISOString(),
    ...overrides,
  };
  return { ...base, toObject: () => base };
};
