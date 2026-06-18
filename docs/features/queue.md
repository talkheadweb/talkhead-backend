# Queue Management

BullMQ-backed job queue with a REST API for external service integration. Every job is persisted in MongoDB (`QueueJob` collection) so the full history survives Redis restarts.

---

## Endpoint Table

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/v1/queue` | Create and enqueue a job | `x-api-key` header |
| `GET` | `/api/v1/queue` | List jobs from MongoDB (search, filter, sort, paginate) | `x-api-key` header |
| `GET` | `/api/v1/queue/:id` | Get a single job by MongoDB `_id` | `x-api-key` header |
| `DELETE` | `/api/v1/queue/:id` | Cancel a job | `x-api-key` header |

---

## Authentication

All endpoints require `x-api-key` header. The key is configured via `QUEUE_API_KEY` env var.

```
x-api-key: your-secret-api-key-here
```

---

## Job Lifecycle

```
POST /queue
     │
     ▼
  pending  ──► BullMQ worker picks up ──► processing
  (MongoDB + BullMQ)                          │
                             ┌────────────────┘
                             ▼
                   external API called
                             │
                  ┌──────────┴──────────┐
                  ▼                     ▼
               accepted              error → BullMQ retries (up to 3×)
           (awaiting callback)            → markFailed after final attempt

  Feature callback webhook (e.g. POST /generations/:id/callback):
    success=true  → feature status = COMPLETED
    success=false → feature status = FAILED

  pending job can be cancelled via DELETE /:id
```

---

## Job Statuses (MongoDB)

| Status | Description |
|--------|-------------|
| `pending` | Created, not yet picked up by worker |
| `processing` | Worker has picked it up — BullMQ `active` event fired |
| `completed` | BullMQ `completed` event fired |
| `failed` | All retries exhausted — BullMQ `failed` event fired |
| `cancelled` | Cancelled via `DELETE /queue/:id` before processing |

> **Note:** The MongoDB `QueueJob.status` is updated by `BullWorker` event listeners (active / completed / failed). The feature document's status (e.g. `Generation.status`) is updated separately via the callback webhook.

---

## Request / Response Examples

### Create a job

```http
POST /api/v1/queue
x-api-key: your-key
Content-Type: application/json

{
  "type": "generation",
  "payload": { "userId": "123", "inputType": "text", "voiceId": "af_heart" },
  "priority": 1
}
```

Response `201`:
```json
{
  "success": true,
  "message": "Queue job created.",
  "data": {
    "_id": "664f1b2c3e4a5b6c7d8e9f02",
    "recordId": "QJ-a1b2c3d4",
    "type": "generation",
    "status": "pending",
    "payload": { "userId": "123", "inputType": "text", "voiceId": "af_heart" },
    "attempts": 0,
    "createdAt": "2026-06-12T10:00:00.000Z"
  }
}
```

### List jobs

```http
GET /api/v1/queue?type=generation&status=failed&page=1&limit=10&sortBy=createdAt&sortOrder=desc
x-api-key: your-key
```

### Get one job

```http
GET /api/v1/queue/664f1b2c3e4a5b6c7d8e9f02
x-api-key: your-key
```

Response `200`:
```json
{
  "data": {
    "_id": "664f1b2c3e4a5b6c7d8e9f02",
    "recordId": "664f1b2c3e4a5b6c7d8e9f00",
    "type": "generation",
    "status": "completed",
    "bullJobId": "664f1b2c3e4a5b6c7d8e9f00",
    "payload": { "userId": "123" },
    "attempts": 1,
    "startedAt": "2026-06-12T10:00:01.000Z",
    "finishedAt": "2026-06-12T10:00:05.000Z",
    "createdAt": "2026-06-12T10:00:00.000Z"
  }
}
```

### Cancel a job

```http
DELETE /api/v1/queue/664f1b2c3e4a5b6c7d8e9f02
x-api-key: your-key
```

Returns `409` if the job is `processing` or `completed` or already `cancelled`.

---

## List Query Parameters

| Param | Description |
|-------|-------------|
| `search` | Partial match on `recordId` or `bullJobId` |
| `status` | Filter by MongoDB status (`pending`, `processing`, `completed`, `failed`, `cancelled`) |
| `type` | Filter by job type (e.g. `generation`) |
| `page` | Page number (default 1) |
| `limit` | Items per page (default 10) |
| `sortBy` | Field to sort by (default `createdAt`) |
| `sortOrder` | `asc` or `desc` (default `desc`) |

Data is read from MongoDB — full history, not limited to Redis TTL.

---

## Using QueueUtil from Feature Services

```ts
import { QueueUtil } from "@/Config/queue";
import { QueueJobType } from "@/Config/queue/const";

// Enqueue a job — creates QueueJob in MongoDB + adds to BullMQ
const { queueJobId } = await QueueUtil.enqueue(
  String(doc._id),           // recordId — MongoDB _id of your feature record
  QueueJobType.GENERATION,   // type — typed constant from Config/queue/const.ts
  { userId, voiceId, ... },  // payload — feature-specific data
  { priority: 1 },           // optional: priority, delay, attempts
);

// Save queueJobId reference on the feature document for cross-lookup
await FeatureModel.findByIdAndUpdate(doc._id, { queueJobId });
```

`enqueue` internally:
1. Creates `QueueJob` in MongoDB (status: `pending`)
2. Adds job to BullMQ using `recordId` as the BullMQ job ID
3. Saves BullMQ's internal ID back onto `QueueJob.bullJobId` (fire-and-forget)
4. Returns `{ queueJobId }` — MongoDB `_id` of the `QueueJob` document

---

## Business Rules

- **MongoDB is the source of truth** for job history — not Redis. Use `GET /queue/:id` for job status queries; BullMQ is only for live processing.
- **Sequential by default:** `QUEUE_CONCURRENCY = 1` — jobs run one at a time.
- **Retries:** 3 attempts with exponential backoff (2 s, 4 s, 8 s).
- **type is required:** Every job must carry a `type` matching a `QueueJobType` constant.
- **Callback pattern:** Workers fire-and-forget to the external service. Completion arrives via a `POST /:id/callback` webhook on the feature's router — not from within the processor.
- **Cancel guard:** Cancelling a `processing` or `completed` job returns 409.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `QUEUE_API_KEY` | ✅ | — | API key for REST endpoints and feature callback webhooks |
| `QUEUE_EXTERNAL_API_URL` | ✅ | — | External service URL the processor POSTs jobs to |
| `QUEUE_NAME` | ❌ | `main-queue` | BullMQ queue name |
| `QUEUE_CONCURRENCY` | ❌ | `1` | Jobs processed in parallel |

---

## File Structure

```
src/
  Config/queue/
    index.ts                      # bullQueue + BullWorker + QueueUtil + QueueJobModel re-export
    const.ts                      # QueueJobType + QueueJobStatus (add new types here)
    model.ts                      # QueueJob MongoDB model (persistent job store)
    types.ts                      # TQueueJobData, TEnqueueOptions, IQueueJob, TEnqueueResult
    processors/
      index.ts                    # processQueueJob router (switch on type)
      generation.processor.ts     # Generation-specific handler (no markCompleted)

  App/Queue/
    controller.ts                 # HTTP handlers
    service.ts                    # MongoDB-backed CRUD (list, getById, cancel)
    routes.ts                     # Express router (all routes API-key protected)
    types.ts                      # TCreateQueueJobBody, TQueueJobStatus, DTOs
    validation.ts                 # Zod schemas
    queue.swagger.ts              # OpenAPI definitions

  Middlewares/ApiKey/
    index.ts                      # apiKeyAuth middleware (timing-safe comparison)
```
