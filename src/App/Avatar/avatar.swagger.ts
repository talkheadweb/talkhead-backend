import {
  binary, bool, dateRangeParams, enumOf, ok, created, errors,
  multipartBody, jsonBody, queryParam, paginationParams, sortParams,
  str, withTag,
} from "@/Config/swagger/helpers";

const { post, get, patch, del } = withTag("Avatar");

const fileRecordRef = {
  type      : "object",
  description: "Populated FileRecord — full file metadata from the File module",
  properties: {
    _id         : { type: "string", example: "664f1b2c3e4a5b6c7d8e9f03" },
    fileUrl     : { type: "string", example: "https://cdn.example.com/avatars/550e8400.jpg" },
    mimeType    : { type: "string", example: "image/jpeg" },
    fileSize    : { type: "integer", example: 102400 },
    originalName: { type: "string", example: "narrator.jpg" },
    folder      : { type: "string", example: "avatars" },
  },
};

const avatarSchema = {
  type      : "object",
  properties: {
    _id      : { type: "string", example: "664f1b2c3e4a5b6c7d8e9f00" },
    title    : { type: "string", example: "Professional Narrator" },
    slug     : { type: "string", example: "professional-narrator" },
    fileKey  : { type: "string", example: "avatars/550e8400-e29b-41d4-a716-446655440000.jpg" },
    file     : fileRecordRef,
    isActive : { type: "boolean", example: true },
    isSystem : { type: "boolean", example: false, description: "true = platform-predefined (never auto-deleted); false = user-uploaded (auto-deleted after 7 days)" },
    createdBy: { type: "string", example: "664f1b2c3e4a5b6c7d8e9f01" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const listParams: object[] = [
  queryParam("search",   { type: "string" },              "Search by title or slug"),
  queryParam("isActive", { type: "boolean" },             "Filter by active status (admin only shows inactive)"),
  queryParam("createdBy", { type: "string" },             "Filter by creator userId"),
  ...paginationParams,
  ...sortParams,
  ...dateRangeParams,
];

export const avatarPaths = {
  "/avatars": {
    ...post({
      summary   : "Upload a new avatar",
      description: "Admin only. Uploads an image to R2 and creates an avatar record. File key is always UUID-based — never overwrites existing files.",
      secured   : true,
      body      : multipartBody({
        required: ["file", "title"],
        props   : {
          file    : binary({ description: "Avatar image (JPEG, PNG, GIF, WebP — max 5 MB)" }),
          title   : str({ min: 1, max: 100, example: "Professional Narrator" }),
          slug    : str({ min: 1, max: 100, example: "professional-narrator" }),
          isSystem: { ...bool({ example: false }), description: "Mark as system avatar — preserved indefinitely (default: false)" },
        },
      }),
      responses: { ...created("Avatar created.", avatarSchema), ...errors(400, 401, 403, 409) },
    }),
    ...get({
      summary   : "List avatars",
      description: "Authenticated users see active avatars only. Admins see all (including inactive). Supports search, filter, sort, and pagination.",
      secured   : true,
      parameters: listParams,
      responses : { ...ok("Avatars fetched.", { type: "array", items: avatarSchema }), ...errors(401) },
    }),
  },

  "/avatars/{id}": {
    ...get({
      summary   : "Get one avatar",
      secured   : true,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses : { ...ok("Avatar fetched.", avatarSchema), ...errors(401, 404) },
    }),
    ...patch({
      summary   : "Update an avatar (admin)",
      secured   : true,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      body      : jsonBody({
        props: {
          title   : str({ min: 1, max: 100 }),
          slug    : str({ min: 1, max: 100, example: "professional-narrator" }),
          isActive: bool({ example: false }),
          isSystem: bool({ example: true }),
        },
      }),
      responses : { ...ok("Avatar updated.", avatarSchema), ...errors(400, 401, 403, 404, 409) },
    }),
    ...del({
      summary   : "Delete an avatar (admin)",
      description: "Hard-deletes the record and removes the file from R2.",
      secured   : true,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses : { ...ok("Avatar deleted."), ...errors(401, 403, 404) },
    }),
  },
};
