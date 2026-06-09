# Queue Management

BullMQ-backed job queue with a REST API for external service integration.

---

## Endpoint Table

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/v1/queue` | Create and enqueue a job | `x-api-key` header |
| `GET` | `/api/v1/queue` | List jobs (search, filter, sort, paginate) | `x-api-key` header |
| `GET` | `/api/v1/queue/:jobId` | Get a single job by BullMQ job ID | `x-api-key` header |
| `DELETE` | `/api/v1/queue/:jobId` | Cancel / remove a job | `x-api-key` header |

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
                                               │
                              ┌────────────────┼──────────────┐
                              ▼                ▼              
                          completed          failed          
                                               │
                                     retries (up to 3×)
                                     exponential backoff
                                               │
                                         failed (final)

  pending job can be cancelled via DELETE /:jobId
```

---

## Job Statuses

BullMQ native statuses (read directly from Redis):

| Status | Description |
|--------|-------------|
| `waiting` | In queue, not yet picked up |
| `active` | Currently being processed by the worker |
| `completed` | Worker finished successfully |
| `failed` | All retries exhausted |
| `delayed` | Scheduled to run after a delay |
| `paused` | Queue is paused |

---

## Request / Response Examples

### Create a job

```http
POST /api/v1/queue
x-api-key: your-key
Content-Type: application/json

{
  "type": "generation",
  "payload": { "userId": "123", "inputType": "text", "outputType": "audio" },
  "priority": 1,
  "note": "Urgent request"
}
```

Response `201`:
```json
{
  "success": true,
  "message": "Queue job created.",
  "data": {
    "recordId": "QJ-a1b2c3d4",
    "bullJobId": "42",
    "type": "generation",
    "status": "pending",
    "payload": { "userId": "123", "inputType": "text", "outputType": "audio" }
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
GET /api/v1/queue/42
x-api-key: your-key
```

Response `200`:
```json
{
  "data": {
    "bullJobId": "42",
    "recordId": "QJ-a1b2c3d4",
    "type": "generation",
    "status": "completed",
    "payload": { "userId": "123" },
    "attempts": 1,
    "createdAt": "2026-06-09T10:00:00.000Z",
    "processedAt": "2026-06-09T10:00:01.000Z",
    "finishedAt": "2026-06-09T10:00:05.000Z",
    "failedReason": null
  }
}
```

### Cancel a job

```http
DELETE /api/v1/queue/42
x-api-key: your-key
```

Returns `409` if the job is `active` or `completed`.

---

## List Query Parameters

| Param | Description |
|-------|-------------|
| `search` | Partial match on `recordId` or `bullJobId` |
| `status` | Filter by BullMQ status (`waiting`, `active`, `completed`, `failed`, `delayed`, `paused`) |
| `type` | Filter by job type (e.g. `generation`) |
| `page` | Page number (default 1) |
| `limit` | Items per page (default 10) |
| `sortBy` | Field to sort by (default `createdAt`) |
| `sortOrder` | `asc` or `desc` (default `desc`) |

> Data is read live from BullMQ (Redis). There is no MongoDB model for raw queue jobs. Business history (status, result URLs, etc.) is stored in each feature's own model.

---

## BullMQ Worker Flow

When a job becomes active, the worker (`Config/queue/processors/index.ts`) routes it by `job.data.type`:

```
processQueueJob(job)
  switch(job.data.type)
    case "generation" → handleGenerationJob(job)
      1. GenerationService.markProcessing(recordId)
      2. POST to QUEUE_EXTERNAL_API_URL with { recordId, payload }
      3. success → GenerationService.markCompleted(recordId, result)
      4. failure → GenerationService.markFailed(recordId, errorMessage)
                   throw  → BullMQ retries (up to 3×)
```

**DB rule:** Processors never touch the database directly. All persistence goes through the feature's service worker-callback methods (`markProcessing` / `markCompleted` / `markFailed`).

---

## Using QueueUtil from Feature Services

```ts
import { QueueUtil } from "@/Config/queue";
import { QueueJobType } from "@/Config/queue/const";

// Enqueue a job
const job = await QueueUtil.enqueue(
  String(doc._id),         // recordId — MongoDB _id of your feature record
  QueueJobType.GENERATION, // type — typed constant from Config/queue/const.ts
  { userId, inputType },   // payload — feature-specific data (no type here)
  { priority: 1 },         // optional: priority, delay, attempts
);

// Check BullMQ state
const state = await QueueUtil.getJobState(job.id!);

// Remove from queue (before processing)
await QueueUtil.remove(job.id!);
```

---

## Business Rules

- **Sequential by default:** `QUEUE_CONCURRENCY = 1` — jobs run one at a time. Raise only if the external API supports parallel requests.
- **Retries:** 3 attempts with exponential backoff (2 s, 4 s, 8 s).
- **type is required:** Every job must carry a `type` matching a `QueueJobType` constant. The processor uses this to route the job to the correct handler.
- **type is typed:** `TQueueJobData.type` is `TQueueJobType` — TypeScript rejects unknown values at the call site.
- **No MongoDB model:** Raw queue state lives in BullMQ (Redis). Feature records (Generation, etc.) track business state in MongoDB via worker callbacks.
- **Cancel vs active:** Cancelling an `active` job returns `409`. Only `waiting` / `delayed` jobs can be removed.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `QUEUE_API_KEY` | ✅ | — | API key for REST endpoints |
| `QUEUE_EXTERNAL_API_URL` | ✅ | — | External AI service webhook URL |
| `QUEUE_NAME` | ❌ | `main-queue` | BullMQ queue name |
| `QUEUE_CONCURRENCY` | ❌ | `1` | Jobs processed in parallel |

---

## File Structure

```
src/
  Config/queue/
    index.ts                      # bullQueue + BullWorker + QueueUtil
    const.ts                      # QueueJobType registry (add new types here)
    types.ts                      # TQueueJobData, TEnqueueOptions, TProcessor
    processors/
      index.ts                    # processQueueJob router (switch on type)
      generation.processor.ts     # Generation-specific handler

  App/Queue/
    controller.ts                 # HTTP handlers
    service.ts                    # BullMQ read operations (list, getOne, cancel)
    routes.ts                     # Express router (all routes API-key protected)
    types.ts                      # TCreateQueueJobBody, TQueueJobStatus, DTOs
    validation.ts                 # Zod schemas (type required, body: wrapper)
    queue.swagger.ts              # OpenAPI definitions

  Middlewares/ApiKey/
    index.ts                      # apiKeyAuth middleware (timing-safe comparison)
```
