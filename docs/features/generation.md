# Generation Module

Manages AI generation jobs. A user submits a request with a voice ID, reference avatar image, and either text or audio input. The server creates a MongoDB record, enqueues a BullMQ job, and the worker triggers the external API in a fire-and-forget pattern. When the external API finishes, it calls back to mark the job complete or failed.

Input files uploaded to R2 are tracked as `FileRecord` documents with `ownerId` set to the generation `_id`. The output file is tracked via `markCompleted` when the callback arrives. File reference ObjectIds (`avatarImageFile`, `inputAudioFile`, `outputFile`) are stored on the generation document as optional links for cross-module traceability.

All R2 file keys stored in the database are converted to presigned URLs before being sent to the frontend. Clients never see raw R2 keys.

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

**At least one of** `avatarImageUrl` **or** `avatarImage` **must be provided.** When `inputType=audio`, `inputAudio` file is required.

### Upload + file tracking flow

1. Controller generates R2 file keys (UUID paths) — no upload yet
2. MongoDB record created + BullMQ job enqueued + `QueueJob` record created
3. Files uploaded to R2 **after** enqueue succeeds
4. Each uploaded file is tracked as a `FileRecord` (fire-and-forget)
5. On successful track, `avatarImageFile` / `inputAudioFile` ObjectId refs are stored on the generation document via `GenerationService.setFileRefs()` (also fire-and-forget)
6. If enqueue fails → DB record rolled back; no files were uploaded (zero cleanup cost)

### Response shape (201)

The controller adds presigned URL fields alongside all R2 keys — the raw keys are also included:

| DB field | Always in response | Added alongside (when field present) |
|----------|-------------------|--------------------------------------|
| `avatarImageKey` (external URL) | `avatarImageKey` — unchanged | — |
| `avatarImageKey` (R2 key) | `avatarImageKey` — raw key | `avatarImageUrl` — presigned URL (1 hr) |
| `inputAudioKey` | `inputAudioKey` — raw key | `inputAudioUrl` — presigned URL (1 hr) |
| `outputFileKey` | `outputFileKey` — raw key | `outputUrl` — presigned URL (1 hr) |

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
    "avatarImageKey": "generations/images/uuid.jpg",
    "avatarImageUrl": "https://r2.example.com/generations/images/uuid.jpg?presigned=...",
    "inputText": "Say this calmly.",
    "avatarImageFile": "664f1b2c3e4a5b6c7d8e9f04",
    "createdAt": "2026-06-14T10:00:00.000Z",
    "updatedAt": "2026-06-14T10:00:00.000Z"
  }
}
```

> `avatarImageFile`, `inputAudioFile`, `outputFile` are populated asynchronously — may be `undefined` on the initial 201 response and set by the time you poll with a GET.

### Test mode

Pass `?mode=test` as a query parameter to skip the external API call and immediately resolve the job with a dummy output file:

```
POST /api/v1/generations?mode=test
```

- The generation record is created and queued normally
- The worker detects `mode=test`, calls `handleCallback` with a hardcoded dummy output key
- The job status moves from `pending → processing → completed` within seconds
- A `generation:update` socket event is emitted with `status: "completed"` and the dummy `outputUrl`
- Dummy file key: `generations/6a2376982deea03e9de2aa8e/c0222feb-fb21-4b3c-a108-94a856ea4f88.mp4`

Useful for frontend integration testing without a live external API.

### Errors

| Code | Reason |
|------|--------|
| 400 | Missing `avatarImage`/`avatarImageUrl`, missing `voiceId`, missing `inputText` when `inputType=text`, missing `inputAudio` when `inputType=audio`, invalid enum |
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

Non-admin users always see only their own records regardless of `userId` filter. Response shape is the same as Create — all file keys replaced with presigned URLs.

---

## Get One

**GET** `/api/v1/generations/:id`

Returns 403 if the requesting user is not the owner and not an admin. Response shape same as above.

---

## Update (Admin)

**PATCH** `/api/v1/generations/:id`

| Field | Type | Description |
|-------|------|-------------|
| `status` | `TGenerationStatus` | New status |
| `outputFileKey` | `string` | R2 object key of the output file |
| `errorMessage` | `string` | Error detail (set when failed) |
| `completedAt` | `Date` | Completion timestamp |

Response includes `outputUrl` (presigned URL generated from `outputFileKey`).

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
| `outputFileKey` | `string` | Required when `success=true` | R2 object key returned by `POST /api/v1/files/external-upload` |
| `message` | `string` | Required when `success=false` | Human-readable failure reason |

When `success=true` and `outputFileKey` is provided, `markCompleted` stores the key on the generation record and links the corresponding `FileRecord` (via `findByFileKey`) as `outputFile` — fire-and-forget.

### Errors

| Code | Reason |
|------|--------|
| 400 | Missing `success` field or `outputFileKey` is empty |
| 401 | Missing API key |
| 403 | Wrong API key |
| 404 | Generation record not found |

---

## Business Rules

1. **Status flow:** `pending` → `processing` → `completed` | `failed`; cancellable from `pending` only
2. **Ownership:** users see and cancel only their own jobs; admins have full access
3. **File rules:** `avatarImageKey` always required (file upload or `avatarImageUrl` body field); `inputAudio` file required only when `inputType=audio`
4. **voiceId always required:** every generation needs a voice ID — no default
5. **File refs are async:** `avatarImageFile`, `inputAudioFile`, `outputFile` are set fire-and-forget after the main response — poll the GET endpoint if you need them
6. **Presigned URLs in responses:** all R2 file keys are replaced with presigned URLs (1 hr TTL) before sending to the frontend — clients always receive working URLs
7. **Queue persistence:** every enqueued job is also stored in the `QueueJob` MongoDB collection via `QueueUtil.enqueue` — durable even if Redis is flushed
8. **Retry policy:** BullMQ retries a failed external API trigger 3× with exponential backoff (2 s, 4 s, 8 s)
9. **Constants:** all status/type values come from `const.ts` — never use raw strings

---

## Worker Callback Methods

The queue processor (`Config/queue/processors/generation.processor.ts`) never touches the database directly. It delegates to:

| Method | When called | What it does |
|--------|-------------|--------------|
| `GenerationService.markProcessing(recordId)` | Worker picks up job | `status → PROCESSING` |
| `GenerationService.markFailed(recordId, msg)` | External API trigger fails | `status → FAILED` + `errorMessage` |
| `GenerationService.markCompleted(id, key?)` | Callback `success=true` | `status → COMPLETED` + `outputFileKey` + `completedAt` + links `outputFile` FileRecord ref |
| `GenerationService.setFileRefs(id, refs)` | After input file upload+track | Stores `avatarImageFile` / `inputAudioFile` ObjectId refs |

---

## Full Job Lifecycle

```
User → POST /generations (multipart)
  ↓
Controller:
  generate R2 keys (no upload yet)
  ↓
GenerationService.create()
  ├─ GenerationModel.create({ status: PENDING, avatarImageKey, inputAudioKey, voiceId, ... })
  ├─ QueueUtil.enqueue(recordId, QueueJobType.GENERATION, payload)
  │    ├─ QueueJobModel.create({ recordId, type, payload, status: PENDING })   ← MongoDB
  │    └─ bullQueue.add(recordId, data, { jobId: recordId })                  ← Redis/BullMQ
  └─ GenerationModel.findByIdAndUpdate(doc._id, { queueJobId })
  ↓
Controller:
  upload avatarImage to R2  → FileService.track() → setFileRefs({ avatarImageFile })
  upload inputAudio to R2   → FileService.track() → setFileRefs({ inputAudioFile })
  (all fire-and-forget after response)

BullMQ Worker:
  handleGenerationJob(job)
  ├─ GenerationService.markProcessing(recordId)   → status = PROCESSING
  ├─ triggerExternalApi(recordId, payload)
  │     dev  → skip HTTP, log only
  │     prod → POST QUEUE_EXTERNAL_API_URL → await 2xx (fire-and-forget trigger)
  │
  ├─ trigger accepted (2xx) → log "awaiting callback", worker exits
  │
  └─ trigger rejected (non-2xx / network error)
        GenerationService.markFailed(recordId, msg)
        → status = FAILED, errorMessage
        throw → BullMQ retries (up to 3×, exponential backoff: 2s → 4s → 8s)

External API → POST /files/external-upload (x-api-key)
  → uploads output file to R2, creates FileRecord
  → returns { fileKey: "generations/output/uuid.mp4" }

External API → POST /generations/:id/callback (x-api-key)
  body: { success: true, outputFileKey: "generations/output/uuid.mp4" }
  ↓
GenerationService.handleCallback()
  success=true  → markCompleted(id, outputFileKey)
                   → status = COMPLETED, outputFileKey, completedAt stored
                   → FileService.findByFileKey() → outputFile ref linked (fire-and-forget)
                   → socket emit `generation:update` to user:&lt;userId&gt;
                      { generationId, status: "completed", outputFileKey, outputUrl }
  success=false → markFailed(id, message) → status = FAILED, errorMessage
                   → socket emit `generation:update` to user:&lt;userId&gt;
                      { generationId, status: "failed", errorMessage }
```

---

## File Structure

```
src/App/Core/Generation/
  const.ts              ← GenerationStatus, GenerationInputType (TEXT | AUDIO)
  types.ts              ← IGeneration (avatarImageFile?, inputAudioFile?, outputFile? ObjectId refs),
                           TCreateGenerationBody, TCallbackBody,
                           GenerationFilterKeys, GenerationExtraFilterKeys
  model.ts              ← Mongoose schema
                           R2 key fields: avatarImageKey, inputAudioKey, outputFileKey
                           FileRecord refs: avatarImageFile, inputAudioFile, outputFile
  validation.ts         ← createGenerationSchema, updateGenerationSchema,
                           callbackGenerationSchema
  service.ts            ← CRUD + queue integration + worker callbacks + handleCallback + setFileRefs
  controller.ts         ← HTTP handlers — withPublicUrls() converts all R2 keys to presigned URLs
  routes.ts             ← Express router — callback route uses apiKeyAuth (no JWT)
  generation.swagger.ts ← OpenAPI definitions

src/Config/queue/
  const.ts              ← QueueJobType.GENERATION, QueueJobStatus
  processors/
    generation.processor.ts  ← fire-and-forget trigger + markProcessing/Failed

__tests__/Generation/
  create.test.ts        ← multipart happy paths + all validation + 401
  list.test.ts
  getOne.test.ts
  update.test.ts
  cancel.test.ts
  delete.test.ts
  callback.test.ts      ← success/failure/validation/auth/404
```
