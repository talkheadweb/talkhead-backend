# Avatar Module

Manages AI avatar images uploaded to Cloudflare R2. Admins upload and manage avatars; authenticated users browse active avatars when selecting one for a generation job.

All file keys are UUID-based — uploads never overwrite or version existing files. Every upload produces a globally unique R2 key regardless of the original filename.

File metadata is stored in a central `FileRecord` document and populated into the avatar response. The avatar document itself stores `fileKey` (R2 object key — for direct R2 operations without a populate) and `file` (the `FileRecord` ObjectId reference). Responses always include `fileUrl` (presigned URL, 1 hr TTL) alongside `fileKey` — raw keys are never the only option sent to the frontend.

---

## Endpoint Table

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/v1/avatars` | Upload a new avatar image | Bearer token (admin only) |
| `GET` | `/api/v1/avatars` | List avatars | Bearer token (users see active only; admins see all) |
| `GET` | `/api/v1/avatars/:id` | Get one avatar | Bearer token (users see active only) |
| `PATCH` | `/api/v1/avatars/:id` | Update title / slug / isActive | Bearer token (admin only) |
| `DELETE` | `/api/v1/avatars/:id` | Hard delete + R2 file cleanup | Bearer token (admin only) |

---

## Create Avatar

**POST** `/api/v1/avatars`

**Content-Type:** `multipart/form-data`

### Form Fields

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `file` | file | ✅ | JPEG, PNG, GIF, or WebP — max **5 MB** |
| `title` | `string` | ✅ | 1–100 characters |
| `slug` | `string` | ❌ | 1–100 chars, lowercase letters / digits / hyphens only. Auto-derived from `title` if omitted. |

### Slug auto-derivation

If `slug` is not provided: `title` is lowercased, spaces become hyphens, special characters are stripped.
`"Professional Narrator"` → `"professional-narrator"`

### Response (201)

```json
{
  "success": true,
  "message": "Avatar created.",
  "data": {
    "_id": "664f1b2c3e4a5b6c7d8e9f00",
    "title": "Professional Narrator",
    "slug": "professional-narrator",
    "fileKey": "avatars/550e8400-e29b-41d4-a716-446655440000.jpg",
    "fileUrl": "https://r2.example.com/avatars/550e8400.jpg?presigned=...",
    "file": {
      "_id": "664f1b2c3e4a5b6c7d8e9f03",
      "fileKey": "avatars/550e8400-e29b-41d4-a716-446655440000.jpg",
      "fileUrl": "https://r2.example.com/avatars/550e8400.jpg?presigned=...",
      "mimeType": "image/jpeg",
      "fileSize": 102400,
      "originalName": "narrator.jpg",
      "folder": "avatars"
    },
    "isActive": true,
    "createdBy": "664f1b2c3e4a5b6c7d8e9f01",
    "createdAt": "2026-06-13T10:00:00.000Z",
    "updatedAt": "2026-06-13T10:00:00.000Z"
  }
}
```

### Errors

| Code | Reason |
|------|--------|
| 400 | Missing `file` or `title`; invalid slug format |
| 401 | No / invalid token |
| 403 | Not an admin |
| 409 | An avatar with this slug already exists |

---

## List Avatars

**GET** `/api/v1/avatars`

### Access rules

- **Users** always see only `isActive: true` avatars (enforced server-side regardless of query params)
- **Admins** see all avatars; can filter by `isActive` explicitly

### Query Parameters

| Param | Description |
|-------|-------------|
| `search` | Search by title or slug (regex) |
| `isActive` | Filter by status — admin only (users always get active) |
| `createdBy` | Filter by creator userId |
| `page` | Page number (default 1) |
| `limit` | Items per page (default 10) |
| `sortBy` | Field to sort by (default `createdAt`) |
| `sortOrder` | `asc` or `desc` (default `desc`) |

The `file` field is populated in list responses — each item includes full file metadata inline.

---

## Get One

**GET** `/api/v1/avatars/:id`

- Users: returns 404 if avatar is inactive (same as not found)
- Admins: returns the avatar regardless of `isActive`
- `file` field is populated — full file metadata included inline

---

## Update (Admin)

**PATCH** `/api/v1/avatars/:id`

**Content-Type:** `application/json`

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | New display title |
| `slug` | `string` | New slug (must be unique across all avatars) |
| `isActive` | `boolean` | Activate or deactivate the avatar |

At least one field is required. The response includes the updated document with `file` populated.

---

## Delete (Admin)

**DELETE** `/api/v1/avatars/:id`

Hard-deletes the MongoDB record and cascade-deletes the associated R2 file and `FileRecord` via `FileService.deleteByOwner()` (fire-and-forget — R2/FileRecord deletion failure does not fail the request).

---

## Business Rules

1. **Unique slugs:** slugs are globally unique across all avatars; 409 is returned on conflict
2. **Immutable files:** file uploads are write-once; updating an avatar changes metadata only — the R2 file is never modified or replaced
3. **Unique file keys:** every upload generates a fresh UUID key — `avatars/<uuid><ext>` — guaranteeing no two uploads share the same R2 path even with identical original filenames
4. **Visibility:** inactive avatars are hidden from non-admins at both the list and get-one level
5. **R2 + FileRecord cascade on delete:** when an avatar is deleted, all its associated `FileRecord` documents (matched by `ownerId`) are also deleted from MongoDB and R2 asynchronously

---

## FileService Integration

Avatar uploads use `FileService.upload()` which handles both the R2 upload and `FileRecord` creation in one call. Deletes use `FileService.deleteByOwner()` which cascade-deletes all linked `FileRecord` entries.

```ts
import { FileService } from "@/App/File/service";
import { FileType } from "@/App/File/const";

// In avatar controller create handler:
const fileRecord = await FileService.upload(req.file, req, { type: FileType.AVATAR_IMAGE });
// fileRecord._id and fileRecord.fileKey are stored on the avatar document
// Responses add fileUrl (presigned URL) alongside fileKey at both avatar and file level

// In avatar service remove handler:
FileService.deleteByOwner(String(doc._id)).catch(() => {});
```

See [`docs/features/file.md`](file.md) for full FileService API reference.

---

## File Structure

```
src/App/Avatar/
  const.ts          ← (empty — no module-specific constants needed post-refactor)
  types.ts          ← IAvatar (file: ObjectId ref FileRecord, fileKey: string), search/filter keys, DTOs
  model.ts          ← Mongoose schema (file → ref: "FileRecord", fileKey: String)
  validation.ts     ← createAvatarSchema, updateAvatarSchema (Zod, wrapped for validateRequest)
  service.ts        ← CRUD + slug derivation + populate("file") on reads + deleteByOwner on delete
  controller.ts     ← HTTP handlers (multer → FileService.upload → AvatarService.create)
  routes.ts         ← Express router
  avatar.swagger.ts ← OpenAPI definitions

__tests__/Avatar/
  _helpers.ts       ← Shared tokens + makeAvatarDoc factory (file as populated object)
  create.test.ts
  list.test.ts
  get-one.test.ts
  update.test.ts
  delete.test.ts
```
