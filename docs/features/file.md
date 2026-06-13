# File Module

Centralized file record registry. Every file uploaded to Cloudflare R2 through the platform is tracked here as a `FileRecord` document. The File module provides admin and owner-facing APIs for browsing, inspecting, and deleting file records — it does **not** expose a direct upload endpoint (uploads happen through owning module routes such as `/avatars`, `/generations`, etc.).

---

## File Types

| Type | Folder pattern | Allowed mimes | Max size | Owner model | Delete with owner |
|------|---------------|---------------|----------|-------------|-------------------|
| `profile_picture` | `profiles/` | JPEG, PNG, WebP | 2 MB | User | No |
| `avatar_image` | `avatars/` | JPEG, PNG, WebP, GIF | 5 MB | Avatar | Yes |
| `generation` | `generations/<userId>/` | JPEG, PNG, MP3, WAV, M4A | 12 MB | Generation | Yes |

---

## Endpoint Table

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/files` | List file records | Bearer token (users see own only; admins see all) |
| `GET` | `/api/v1/files/:id` | Get one file record | Bearer token (owner or admin) |
| `DELETE` | `/api/v1/files/:id` | Delete record + R2 file | Bearer token (owner or admin) |
| `GET` | `/api/v1/files/:id/presigned` | Generate presigned URL | Bearer token (owner or admin) |

---

## List Files

**GET** `/api/v1/files`

### Access rules

- **Users** see only files they uploaded (`uploadedBy` filter injected server-side)
- **Admins** see all files; can filter freely

### Query Parameters

| Param | Description |
|-------|-------------|
| `search` | Search by originalName or mimeType |
| `type` | Filter by file type (`profile_picture`, `avatar_image`, `generation`) |
| `ownerType` | Filter by owner model name (`User`, `Avatar`, `Generation`) |
| `ownerId` | Filter by owner document id |
| `page` | Page number (default 1) |
| `limit` | Items per page (default 10) |
| `sortBy` | Field to sort by (default `createdAt`) |
| `sortOrder` | `asc` or `desc` (default `desc`) |

### Response (200)

```json
{
  "success": true,
  "message": "Files fetched.",
  "data": [
    {
      "_id": "664f1b2c3e4a5b6c7d8e9f00",
      "type": "avatar_image",
      "folder": "avatars",
      "fileKey": "avatars/550e8400-e29b-41d4-a716-446655440000.jpg",
      "fileUrl": "https://cdn.example.com/avatars/550e8400-e29b-41d4-a716-446655440000.jpg",
      "originalName": "avatar.jpg",
      "mimeType": "image/jpeg",
      "fileSize": 102400,
      "uploadedBy": "664f1b2c3e4a5b6c7d8e9f01",
      "ownerType": "Avatar",
      "ownerId": "664f1b2c3e4a5b6c7d8e9f02",
      "deleteWithOwner": true,
      "createdAt": "2026-06-13T10:00:00.000Z",
      "updatedAt": "2026-06-13T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

---

## Get One

**GET** `/api/v1/files/:id`

- Returns 404 if the record does not exist or the caller is not the owner (non-admin)

---

## Delete

**DELETE** `/api/v1/files/:id`

Hard-deletes the MongoDB `FileRecord` and removes the file from Cloudflare R2 (fire-and-forget — R2 deletion failure does not fail the request).

Only the uploader or an admin can delete.

---

## Presigned URL

**GET** `/api/v1/files/:id/presigned`

Generates a time-limited presigned URL for accessing a private R2 file.

### Query Parameters

| Param | Description |
|-------|-------------|
| `expiresIn` | Expiry in seconds (default 3600 = 1 hour) |

### Response (200)

```json
{
  "success": true,
  "message": "Presigned URL generated.",
  "data": { "url": "https://...r2.cloudflarestorage.com/...?X-Amz-..." }
}
```

---

## Using FileService in other modules

### Standard upload — `FileService.upload()`

For any module that receives a file via multer and needs to upload it to R2 and track it:

```ts
import { FileService } from "@/App/File/service";
import { FileType } from "@/App/File/const";

// Inside a controller handler:
const fileRecord = await FileService.upload(req.file, req, {
  type   : FileType.AVATAR_IMAGE,
  ownerId: avatarId,          // optional — link file to its owner doc
});
// fileRecord._id, fileKey, fileUrl, mimeType, fileSize are all available
```

The service reads `req.user!.uid` for `uploadedBy` and the folder path (used for `GENERATION` type).

### Pre-existing R2 upload — `FileService.track()`

For cases where the R2 upload is handled externally (e.g. the generation controller uploads after enqueue, or the auth service applies sharp compression before uploading):

```ts
FileService.track(userId, {
  type        : FileType.GENERATION,
  fileKey     : "generations/user123/uuid.mp3",
  fileUrl     : "generations/user123/uuid.mp3",
  originalName: "voice.mp3",
  mimeType    : "audio/mpeg",
  fileSize    : 204800,
  ownerId     : generationId,
}).catch(() => {});   // non-critical — fire-and-forget
```

### Cascade delete — `FileService.deleteByOwner()`

Call this when deleting an owner document to clean up all its files:

```ts
await FileService.deleteByOwner("Avatar", avatarId);      // deletes R2 files + FileRecords
await FileService.deleteByOwner("Generation", genId);
```

Only records with `deleteWithOwner: true` are removed (see type config above).

### Single file delete — `FileService.deleteByKey()`

```ts
FileService.deleteByKey(fileKey).catch(() => {});  // fire-and-forget
```

---

## `createUpload(type)` Multer Factory

For single-file upload routes, use the factory from `Utils/file/config.ts`:

```ts
import { createUpload } from "@/Utils/file/config";
import { FileType } from "@/App/File/const";

// In routes.ts:
router.post("/", authenticate, createUpload(FileType.AVATAR_IMAGE).single("file"), controller);
```

The factory derives allowed mimes and max size from `FileTypeConfig`. For multi-field uploads (like generation with `referenceImage` + `inputAudio`), keep the existing `generationUpload` multer instance.

---

## Business Rules

1. **Ownership**: `uploadedBy` always equals the authenticated user at upload time
2. **Access**: non-admins can only see and delete files they uploaded
3. **R2 key uniqueness**: all file keys are UUID-based — no overwrites, ever
4. **deleteWithOwner flag**: derived from `FileTypeConfig` at creation time — profile pictures are kept even if the user is deleted; avatar and generation files are cascade-deleted with their owner
5. **Presigned URLs**: for private buckets (no `customDomain`), `fileUrl` stores the bare `fileKey`; use the presigned endpoint to get a temporary access URL

---

## File Structure

```
src/App/File/
  const.ts          ← FileType enum, FileTypeValues, OwnerType, FileTypeConfig
  types.ts          ← IFileRecord, TUploadPayload, TTrackPayload, TListFilesPayload
  model.ts          ← FileRecord Mongoose model
  validation.ts     ← Zod query schema
  service.ts        ← FileService: upload, track, deleteByOwner, deleteByKey, getById, getPresignedUrlById, list, remove
  controller.ts     ← HTTP handlers
  routes.ts         ← Express router
  file.swagger.ts   ← OpenAPI definitions

src/Utils/file/
  config.ts         ← Multer instances (upload, generationUpload, avatarUpload) + createUpload(type) factory

__tests__/File/
  _helpers.ts
  list.test.ts
  get-one.test.ts
  delete.test.ts
  presigned.test.ts
```
