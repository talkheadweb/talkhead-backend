# Generation Module

Manages AI generation jobs (audio / video). A user submits a request, the server creates a MongoDB record, enqueues a BullMQ job, and the worker calls the external AI service. The record is updated throughout the lifecycle.

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

---

## Create a Generation Job

**POST** `/api/v1/generations`

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inputType` | `"text" \| "audio" \| "image" \| "video"` | ✅ | Type of input provided |
| `outputType` | `"audio" \| "video"` | ✅ | Desired output format |
| `inputText` | `string` (max 5000) | ❌ | Text prompt (when inputType = text) |
| `referenceImageUrl` | `string` (URL) | ❌ | URL to reference image for generation |

### Response (201)

```json
{
  "success": true,
  "message": "Generation job created.",
  "data": {
    "_id": "664f1b2c3e4a5b6c7d8e9f00",
    "userId": "664f1b2c3e4a5b6c7d8e9f01",
    "bullJobId": "42",
    "status": "pending",
    "inputType": "text",
    "outputType": "audio",
    "inputText": "Generate a calming audio about nature.",
    "createdAt": "2026-06-09T10:00:00.000Z",
    "updatedAt": "2026-06-09T10:00:00.000Z"
  }
}
```

### Errors

| Code | Reason |
|------|--------|
| 400 | Validation failure (missing required fields, invalid enum value) |
| 401 | No / invalid token |

---

## List Generation Jobs

**GET** `/api/v1/generations`

### Query Parameters

| Param | Description |
|-------|-------------|
| `search` | Partial match on `ysid` or MongoDB `_id` |
| `status` | Filter by status — `pending`, `processing`, `completed`, `failed`, `cancelled` |
| `inputType` | Filter by input type — `text`, `audio`, `image`, `video` |
| `outputType` | Filter by output type — `audio`, `video` |
| `userId` | Filter by owner userId (admin only; ignored for non-admins) |
| `page` | Page number (default 1) |
| `limit` | Items per page (default 10, max 100) |
| `sortBy` | Field to sort by (default `createdAt`) |
| `sortOrder` | `asc` or `desc` (default `desc`) |

**Note:** Non-admin users always see only their own records regardless of `userId` filter.

---

## Get One

**GET** `/api/v1/generations/:id`

Returns 403 if the requesting user is not the owner and not an admin.

---

## Update (Admin)

**PATCH** `/api/v1/generations/:id`

Allows an admin or the BullMQ worker callback to update result fields.

| Field | Type | Description |
|-------|------|-------------|
| `status` | `TGenerationStatus` | New status |
| `audioUrl` | `string` (URL) | Generated audio result |
| `videoUrl` | `string` (URL) | Generated video result |
| `ysid` | `string` | External service session ID |
| `errorMessage` | `string` | Error detail (set when failed) |
| `completedAt` | `Date` | Completion timestamp |

---

## Cancel

**PATCH** `/api/v1/generations/:id/cancel`

- Only works while `status === "pending"` (job not yet picked up by worker)
- Removes the job from the BullMQ queue and sets `status = "cancelled"`
- Returns 409 if job is already in any non-pending state

---

## Delete (Admin)

**DELETE** `/api/v1/generations/:id`

Hard-deletes the MongoDB record. Does not attempt to remove from BullMQ (job may already be processed).

---

## Business Rules

1. **Status flow:** `pending` → `processing` → `completed` | `failed`; can be `cancelled` from `pending` only
2. **Ownership:** users only see and cancel their own jobs; admins have full access
3. **Queue integration:** every create immediately enqueues a BullMQ job; the worker calls the external AI service
4. **Worker updates record:** on success the worker sets `status = completed` + result URLs; on failure sets `status = failed` + `errorMessage`
5. **Retry policy:** BullMQ retries failed external API calls 3× with exponential backoff (2 s, 4 s, 8 s)
6. **Constants:** all status/type values come from `const.ts` — never use raw strings
7. **Role guards:** `EUserRole.ADMIN` enum used throughout — never raw `"admin"` strings

---

## Worker Callback Methods

The queue processor (`Config/queue/processors/generation.processor.ts`) does **not** touch the database directly. It calls these service methods instead:

| Method | When called | What it does |
|--------|-------------|--------------|
| `GenerationService.markProcessing(recordId)` | Job picked up by worker | `status → PROCESSING` |
| `GenerationService.markCompleted(recordId, result)` | External API success | `status → COMPLETED` + saves `audioUrl`, `videoUrl`, `ysid`, `completedAt` |
| `GenerationService.markFailed(recordId, errorMessage)` | External API failure | `status → FAILED` + saves `errorMessage` |

This keeps all DB logic inside the module. The processor is pure orchestration.

---

## File Structure

```
src/App/Core/Generation/
  const.ts              ← All constant values (GenerationStatus, GenerationInputType,
                           GenerationOutputType, GenerationInputTypeValues,
                           GenerationOutputTypeValues, GenerationStatusValues,
                           GENERATION_CACHE_PREFIX)
  types.ts              ← IGeneration interface, DTOs, filter/search keys
  model.ts              ← Mongoose schema
  validation.ts         ← Zod schemas (wrapped in body: z.object)
  service.ts            ← CRUD + queue integration + worker callbacks
  controller.ts         ← HTTP handlers (uses EUserRole for role checks)
  routes.ts             ← Express router (AccessLimit([EUserRole.ADMIN]) for guards)
  generation.swagger.ts ← OpenAPI definitions (full list params: search, filter, sort, pagination)

src/Config/queue/
  const.ts              ← QueueJobType.GENERATION registered here
  processors/
    generation.processor.ts  ← calls GenerationService.mark* — no direct DB

__tests__/Generation/
  create.test.ts
  list.test.ts
  getOne.test.ts
  update.test.ts
  cancel.test.ts
  delete.test.ts
```

---

## Queue Connection

```
User → POST /generations
  → GenerationService.create()
    → GenerationModel.create({ status: PENDING, bullJobId: "pending", ... })
    → QueueUtil.enqueue(recordId, QueueJobType.GENERATION, { userId, inputType, ... })
    → doc.bullJobId = job.id;  doc.save()
    → returns doc

BullMQ Worker (bootstrap.ts)
  → processQueueJob   (Config/queue/processors/index.ts)
    → switch(job.data.type)
      case QueueJobType.GENERATION
        → handleGenerationJob   (Config/queue/processors/generation.processor.ts)
          → GenerationService.markProcessing(recordId)
          → fetch(config.queue.external_api_url, { recordId, payload })
          → success: GenerationService.markCompleted(recordId, { audioUrl, videoUrl, ysid })
          → failure: GenerationService.markFailed(recordId, errorMessage)
                     throw  → BullMQ retries (up to 3×)
```
