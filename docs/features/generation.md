# Generation Module

Manages AI generation jobs. A user submits a request with a voice ID, reference image, and either text or audio input. The server creates a MongoDB record, enqueues a BullMQ job (also persisted in `QueueJob`), and the worker calls the external API and awaits the response directly — saving `outputUrl` on success or `errorMessage` on failure.

Input files uploaded to R2 are tracked as `FileRecord` documents with `ownerId` set to the generation `_id`. The output file is tracked via `markCompleted` when the callback arrives. File reference ObjectIds (`refImageFile`, `audioFile`, `outputFile`) are stored on the generation document as optional links for cross-module traceability.

---

## Endpoint Table

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/v1/generations` | Create a generation job | Bearer token (any role) |
| `GET` | `/api/v1/generations` | List jobs (owner sees own; admin sees all) | Bearer token |
| `GET` | `/api/v1/generations/:id` | Get one job | Bearer token (owner or admin) |
| `PATCH` | `/api/v1/generations/:id` | Update status / result fields | Bearer token (admin only) |
| `PATCH` | `/api/v1/generations/:id/cancel` | Cancel a pending job | Bearer token (owner or admin) |
| `DELETE` | `/api/v1/generations/:id` | Hard delete a record | Bearer token (admin only) |
| `POST` | `/api/v1/generations/:id/callback` | External API callback — mark complete or failed | `x-api-key` header (no JWT) |

---

## Create a Generation Job

**POST** `/api/v1/generations`

**Content-Type:** `multipart/form-data`

### Form Fields

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `inputType` | `"text" \| "audio"` | ✅ | Determines which input field is used |
| `voiceId` | `string` | ✅ | Voice ID for the external API (e.g. `af_heart`) |
| `inputText` | `string` (max 5000) | Required if `inputType=text` | Text to synthesise |
| `avatarImageUrl` | `string` (URL) | Required if no `avatarImage` file | Reference image as URL |
| `avatarImage` | file | Required if no `avatarImageUrl` | JPEG/PNG, max **5 MB** |
| `inputAudio` | file | Required if `inputType=audio` | MP3/WAV/M4A, max **12 MB** |

**At least one of** `avatarImageUrl` **or** `avatarImage` **must be provided.** If both are sent, the file upload takes precedence and the URL is ignored.
When `inputType=audio`, `inputAudio` file is required; `inputText` is ignored.

### Upload + file tracking flow

1. Controller generates R2 file keys (UUID paths) — no upload yet
2. MongoDB record created + BullMQ job enqueued + `QueueJob` record created
3. Files uploaded to R2 **after** enqueue succeeds
4. Each uploaded file is tracked as a `FileRecord` (fire-and-forget)
5. On successful track, `refImageFile` / `audioFile` ObjectId refs are stored on the generation document via `GenerationService.setFileRefs()` (also fire-and-forget)
6. If enqueue fails → DB record rolled back; no files were uploaded (zero cleanup cost)

### Response (201)

```json
{
  "success": true,
  "message": "Generation job created.",
  "data": {
    "_id": "664f1b2c3e4a5b6c7d8e9f00",
    "userId": "664f1b2c3e4a5b6c7d8e9f01",
    "queueJobId": "664f1b2c3e4a5b6c7d8e9f02",
    "status": "pending",
    "inputType": "text",
    "voiceId": "af_heart",
    "avatarImage": "generations/images/uuid.jpg",
    "inputText": "Say this calmly.",
    "refImageFile": "664f1b2c3e4a5b6c7d8e9f04",
    "createdAt": "2026-06-12T10:00:00.000Z",
    "updatedAt": "2026-06-12T10:00:00.000Z"
  }
}
```

> Note: `refImageFile`, `audioFile`, `outputFile` are populated asynchronously after the response returns — they may be `undefined` on the initial 201 response and set by the time you poll with a GET.

### Errors

| Code | Reason |
|------|--------|
| 400 | Missing `avatarImage` / `avatarImageUrl`, missing `voiceId`, missing `inputText` when `inputType=text`, missing `inputAudio` when `inputType=audio`, invalid enum |
| 401 | No / invalid token |

---

## List Generation Jobs

**GET** `/api/v1/generations`

### Query Parameters

| Param | Description |
|-------|-------------|
| `status` | Filter by status — `pending`, `processing`, `completed`, `failed`, `cancelled` |
| `inputType` | Filter by input type — `text`, `audio` |
| `userId` | Filter by owner userId (admin only; ignored for non-admins) |
| `page` | Page number (default 1) |
| `limit` | Items per page (default 10) |
| `sortBy` | Field to sort by (default `createdAt`) |
| `sortOrder` | `asc` or `desc` (default `desc`) |

Non-admin users always see only their own records regardless of `userId` filter.

---

## Get One

**GET** `/api/v1/generations/:id`

Returns 403 if the requesting user is not the owner and not an admin.

---

## Update (Admin)

**PATCH** `/api/v1/generations/:id`

| Field | Type | Description |
|-------|------|-------------|
| `status` | `TGenerationStatus` | New status |
| `outputUrl` | `string` (URL) | Result output URL |
| `errorMessage` | `string` | Error detail (set when failed) |
| `completedAt` | `Date` | Completion timestamp |

---

## Cancel

**PATCH** `/api/v1/generations/:id/cancel`

- Only works while `status === "pending"` (job not yet picked up by worker)
- Removes the job from BullMQ and sets `status = "cancelled"`
- Returns 409 if job is already in any non-pending state

---

## Delete (Admin)

**DELETE** `/api/v1/generations/:id`

Hard-deletes the MongoDB record. Does not attempt R2 file cleanup (files are tracked separately in `FileRecord` and can be cleaned up via the File module).

---

## External API Callback

**POST** `/api/v1/generations/:id/callback`

Called by the external API when async processing finishes. **No JWT required** — secured by `x-api-key` header.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | `boolean` | ✅ | `true` → completed, `false` → failed |
| `outputUrl` | `string` (URL) | ❌ | Generated result URL (set when `success=true`) |

When `success=true` and `outputUrl` is provided, `markCompleted` tracks the output as a `FileRecord` (fire-and-forget) and stores the resulting `FileRecord._id` in `generation.outputFile`.

### Errors

| Code | Reason |
|------|--------|
| 400 | Missing `success` field, `outputUrl` not a valid URL |
| 401 | Missing API key |
| 403 | Wrong API key |
| 404 | Generation record not found |

---

## Business Rules

1. **Status flow:** `pending` → `processing` → `completed` | `failed`; cancellable from `pending` only
2. **Ownership:** users see and cancel only their own jobs; admins have full access
3. **File rules:** `avatarImage` always required (file or URL); `inputAudio` required only when `inputType=audio`
4. **voiceId always required:** every generation needs a voice ID — no default
5. **File refs are async:** `refImageFile`, `audioFile`, `outputFile` are set fire-and-forget after the main response — poll the GET endpoint if you need them
6. **Queue persistence:** every enqueued job is also stored in the `QueueJob` MongoDB collection via `QueueUtil.enqueue` — durable even if Redis is flushed
7. **Retry policy:** BullMQ retries a failed external API call 3× with exponential backoff (2 s, 4 s, 8 s)
8. **Constants:** all status/type values come from `const.ts` — never use raw strings

---

## Worker Callback Methods

The queue processor (`Config/queue/processors/generation.processor.ts`) never touches the database directly. It delegates to:

| Method | When called | What it does |
|--------|-------------|--------------|
| `GenerationService.markProcessing(recordId)` | Worker picks up job | `status → PROCESSING` |
| `GenerationService.markFailed(recordId, msg)` | External API call fails | `status → FAILED` + `errorMessage` |
| `GenerationService.markCompleted(id, url?)` | API response `success=true` | `status → COMPLETED` + `outputUrl` + `completedAt` + tracks `outputFile` ref |
| `GenerationService.setFileRefs(id, refs)` | After input file upload+track | Stores `refImageFile` / `audioFile` ObjectId refs |

---

## Full Job Lifecycle

```
User → POST /generations (multipart)
  ↓
Controller:
  generate R2 keys (no upload yet)
  ↓
GenerationService.create()
  ├─ GenerationModel.create({ status: PENDING, avatarImage, voiceId, ... })
  ├─ QueueUtil.enqueue(recordId, QueueJobType.GENERATION, payload)
  │    ├─ QueueJobModel.create({ recordId, type, payload, status: PENDING })   ← MongoDB
  │    └─ bullQueue.add(recordId, data, { jobId: recordId })                  ← Redis/BullMQ
  └─ GenerationModel.findByIdAndUpdate(doc._id, { queueJobId })
  ↓
Controller:
  upload avatarImage to R2 → FileService.track() → setFileRefs({ refImageFile })
  upload inputAudio to R2    → FileService.track() → setFileRefs({ audioFile })
  (all fire-and-forget after response)

BullMQ Worker (bootstrap.ts):
  handleGenerationJob(job)
  ├─ GenerationService.markProcessing(recordId)   → status = PROCESSING
  ├─ callGenerationApi(recordId, payload)
  │     dev  → mock { success: true, outputUrl: "cdn.example.com/..." }
  │     prod → POST QUEUE_EXTERNAL_API_URL → await { success, outputUrl?, message? }
  │
  ├─ success=true
  │     GenerationService.markCompleted(recordId, outputUrl)
  │     → status = COMPLETED, outputUrl, completedAt
  │     → FileService.track(userId, { type: GENERATION, ownerId: recordId, ... })
  │     → GenerationModel.update({ outputFile: fileRecord._id })
  │
  └─ success=false OR network error
        GenerationService.markFailed(recordId, msg)
        → status = FAILED, errorMessage
        throw → BullMQ retries (up to 3×, exponential backoff)
```

---

## File Structure

```
src/App/Core/Generation/
  const.ts              ← GenerationStatus, GenerationInputType (TEXT | AUDIO),
                           GenerationStatusValues, GenerationInputTypeValues
  types.ts              ← IGeneration (includes refImageFile?, audioFile?, outputFile? ObjectId refs),
                           TCreateGenerationBody, TCallbackBody,
                           GenerationFilterKeys, GenerationExtraFilterKeys
  model.ts              ← Mongoose schema (queueJobId, refImageFile, audioFile, outputFile refs → FileRecord)
  validation.ts         ← createGenerationSchema, updateGenerationSchema,
                           callbackGenerationSchema
  service.ts            ← CRUD + queue integration + worker callbacks + handleCallback + setFileRefs
  controller.ts         ← HTTP handlers (file upload logic, FileService.track, setFileRefs, callback handler)
  routes.ts             ← Express router — callback route uses apiKeyAuth (no JWT)
  generation.swagger.ts ← OpenAPI definitions

src/Config/queue/
  const.ts              ← QueueJobType.GENERATION, QueueJobStatus
  processors/
    generation.processor.ts  ← callGenerationApi (dev mock / prod HTTP) + markProcessing/Completed/Failed

__tests__/Generation/
  create.test.ts        ← multipart happy paths + all validation + 401
  list.test.ts
  getOne.test.ts
  update.test.ts
  cancel.test.ts
  delete.test.ts
  callback.test.ts      ← success/failure/validation/auth/404
```
