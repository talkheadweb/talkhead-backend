import {
  binary, dateRangeParams, enumOf, ok, created, errors,
  multipartBody, str, queryParam, paginationParams, sortParams,
  withTag,
} from "@/Config/swagger/helpers";
import { FileTypeValues } from "./const";

const { post, get, del } = withTag("File");

const fileRecordSchema = {
  type      : "object",
  properties: {
    _id            : { type: "string", example: "664f1b2c3e4a5b6c7d8e9f00" },
    type           : { type: "string", enum: FileTypeValues, example: "avatar_image" },
    folder         : { type: "string", example: "avatars" },
    fileKey        : { type: "string", example: "avatars/550e8400-e29b-41d4-a716-446655440000.jpg" },
    fileUrl        : { type: "string", example: "https://r2.example.com/avatars/550e8400.jpg?presigned=..." },
    originalName: { type: "string", example: "avatar.jpg" },
    mimeType    : { type: "string", example: "image/jpeg" },
    fileSize    : { type: "integer", example: 102400 },
    uploadedBy  : { type: "string", example: "664f1b2c3e4a5b6c7d8e9f01" },
    ownerId     : { type: "string", example: "664f1b2c3e4a5b6c7d8e9f02" },
    createdAt      : { type: "string", format: "date-time" },
    updatedAt      : { type: "string", format: "date-time" },
  },
};

const idParam = [{ in: "path", name: "id", required: true, schema: { type: "string" } }];

const listParams: object[] = [
  queryParam("search",    { type: "string" },             "Search by originalName or mimeType"),
  queryParam("type",    enumOf([...FileTypeValues]), "Filter by file type"),
  queryParam("ownerId", { type: "string" },          "Filter by owner document id"),
  ...paginationParams,
  ...sortParams,
  ...dateRangeParams,
];

export const filePaths = {
  "/files/external-upload": {
    ...post({
      summary    : "Upload generated output file (external API)",
      description: [
        "Called by the external generation API after producing an output file.",
        "Secured by `x-api-key` header — no user JWT required.",
        "",
        "Upload the generated video or audio file here first, then use the returned `fileKey`",
        "as the `outputFileKey` in the callback request to `POST /api/v1/generations/:id/callback`.",
        "",
        "Accepts video (MP4, MOV, WebM, AVI, MPEG) and audio (MP3, WAV, M4A) up to 200 MB.",
        "The file is stored in R2 under `generations/output/` and tracked as a FileRecord.",
        "Provide `generationId` to link the file to its parent generation.",
      ].join("\n"),
      secured  : false,
      body     : multipartBody({
        required: ["file", "generationId"],
        props   : {
          file        : binary({ description: "Generated output file — video or audio, up to 200 MB" }),
          generationId: str({ example: "664f1b2c3e4a5b6c7d8e9f00" }),
          ownerId     : str({ example: "664f1b2c3e4a5b6c7d8e9f01" }),
        },
      }),
      responses: { ...created("File uploaded.", fileRecordSchema), ...errors(400, 401, 403) },
    }),
  },

  "/files/upload": {
    ...post({
      summary   : "Upload a file",
      description: [
        "Upload any supported file and create a tracked FileRecord. Pass `type` in the multipart body to select the file category.",
        "",
        "| type | Folder | Allowed mimes | Max size | Who can upload |",
        "|------|--------|---------------|----------|----------------|",
        "| `profile_picture` | `profiles/` | JPEG, PNG, WebP | 2 MB | Any authenticated user |",
        "| `avatar_image` | `avatars/` | JPEG, PNG, WebP, GIF | 5 MB | Admin only |",
        "| `generation` | `generations/<userId>/` | JPEG, PNG, MP3, WAV, M4A, MP4, MOV, WebM, AVI | 200 MB | Any authenticated user |",
      ].join("\n"),
      secured  : true,
      body     : multipartBody({
        required: ["file", "type"],
        props   : {
          file   : binary({ description: "The file to upload" }),
          type   : enumOf([...FileTypeValues]),
          ownerId: str({ example: "664f1b2c3e4a5b6c7d8e9f02" }),
        },
      }),
      responses: { ...created("File uploaded.", fileRecordSchema), ...errors(400, 401, 403) },
    }),
  },

  "/files": {
    ...get({
      summary   : "List file records",
      description: "Admins see all files. Users see only their own uploads.",
      secured   : true,
      parameters: listParams,
      responses : { ...ok("Files fetched.", { type: "array", items: fileRecordSchema }), ...errors(401) },
    }),
  },

  "/files/{id}": {
    ...get({
      summary   : "Get one file record",
      secured   : true,
      parameters: idParam,
      responses : { ...ok("File fetched.", fileRecordSchema), ...errors(401, 404) },
    }),
    ...del({
      summary   : "Delete a file record and remove the file from R2",
      description: "Owner or admin. R2 deletion is fire-and-forget.",
      secured   : true,
      parameters: idParam,
      responses : { ...ok("File deleted."), ...errors(401, 404) },
    }),
  },

  "/files/{id}/presigned": {
    ...get({
      summary   : "Generate a presigned URL for a private file",
      secured   : true,
      parameters: [
        ...idParam,
        queryParam("expiresIn", { type: "integer" }, "Expiry in seconds (default 3600)"),
      ],
      responses : {
        ...ok("Presigned URL generated.", {
          type: "object",
          properties: { url: { type: "string", example: "https://r2.example.com/...?X-Amz-..." } },
        }),
        ...errors(401, 404),
      },
    }),
  },
};
