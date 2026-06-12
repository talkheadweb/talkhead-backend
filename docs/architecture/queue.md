# Queue Architecture

This document explains how the BullMQ-based queue system is structured, how jobs flow
through it, and how to add new queued features.

---

## Overview

The queue system has two layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Config/queue/          INFRASTRUCTURE                      │
│  ├─ index.ts            bullQueue + BullWorker + QueueUtil  │
│  ├─ const.ts            QueueJobType + QueueJobStatus       │
│  ├─ types.ts            TQueueJobData, IQueueJob,           │
│  │                      TEnqueueOptions, TEnqueueResult     │
│  └─ processors/                                             │
│       ├─ index.ts       processQueueJob router              │
│       └─ generation.processor.ts                            │
├─────────────────────────────────────────────────────────────┤
│  App/Queue/             REST API (admin-facing)             │
│  ├─ model.ts            QueueJob MongoDB model (persistent) │
│  ├─ routes.ts           POST / GET / DELETE endpoints       │
│  ├─ controller.ts       HTTP handlers                       │
│  └─ service.ts          MongoDB-backed CRUD                 │
└─────────────────────────────────────────────────────────────┘
```

---

## BullMQ Configuration

All BullMQ infrastructure is wired in `Config/queue/index.ts`.

### Queue default job options

```ts
defaultJobOptions: {
  attempts        : 3,                              // retry up to 3 times on failure
  backoff         : { type: "exponential", delay: 2000 },  // 2s → 4s → 8s
  removeOnComplete: { count: 5 },                  // keep last 5 completed jobs in Redis
  removeOnFail    : { count: 5 },                  // keep last 5 failed jobs in Redis
}
```

### Retry behaviour

When a processor throws, BullMQ automatically retries using exponential backoff:

| Attempt | Delay before retry |
|---------|-------------------|
| 1st retry | 2 s |
| 2nd retry | 4 s |
| 3rd retry | 8 s |
| After 3rd | job marked `failed`, `BullWorker failed` event fires |

To change retry count or delay for a specific job, pass `attempts` / `delay` to `QueueUtil.enqueue`:

```ts
await QueueUtil.enqueue(recordId, QueueJobType.GENERATION, payload, {
  attempts: 5,    // override default 3
  delay   : 3000, // wait 3s before first attempt
});
```

### Concurrency

`QUEUE_CONCURRENCY` (default `1`) controls how many jobs the worker processes in parallel.
Keep it at `1` while the external API has rate limits. Raise it only when you have confirmed
the external service supports concurrent calls and Redis/CPU headroom exists.

### Job ID pinning

`QueueUtil.enqueue` passes `{ jobId: recordId }` to BullMQ. This makes BullMQ use the
MongoDB document `_id` as its internal job ID, so:

- `bullQueue.getJob(recordId)` works without storing a separate bullJobId anywhere
- `QueueUtil.remove(recordId)` uses the same ID directly
- Duplicate enqueues for the same recordId are silently deduplicated by BullMQ

### Redis job retention

`removeOnComplete: { count: 5 }` and `removeOnFail: { count: 5 }` cap how many
finished jobs BullMQ keeps in Redis. Older ones are evicted automatically. This is why
the `QueueJob` MongoDB model exists — it is the permanent record that survives Redis eviction.

---

## BullWorker event listeners

`BullWorker.start()` registers three events that keep the MongoDB `QueueJob` document in
sync with BullMQ's live state:

| Event | What it does |
|-------|-------------|
| `active` | `QueueJob.status = PROCESSING`, sets `startedAt` |
| `completed` | `QueueJob.status = COMPLETED`, sets `finishedAt` |
| `failed` | `QueueJob.status = FAILED`, sets `failedReason`, `attempts`, `finishedAt` |

These updates are fire-and-forget (`.catch` logged) so a MongoDB hiccup never blocks
the BullMQ event loop.

---

## Persistent Job Store — QueueJob Model

BullMQ stores jobs in Redis, which is not durable. Every `QueueUtil.enqueue` call also
creates a `QueueJob` document in MongoDB so the full history survives Redis restarts,
pod recycling, or queue flushes.

| Field | Type | Description |
|-------|------|-------------|
| `recordId` | string | Feature document `_id` — link back to the owning record |
| `type` | `TQueueJobType` | Job type constant |
| `payload` | object | Full payload at enqueue time |
| `status` | enum | `pending → processing → completed \| failed \| cancelled` |
| `bullJobId` | string? | BullMQ internal ID — informational only |
| `attempts` | number | Retry count (updated on failure) |
| `failedReason` | string? | Last error message |
| `startedAt` | Date? | When the worker picked up the job |
| `finishedAt` | Date? | When the job completed or permanently failed |

Feature documents (e.g. `Generation`) store a `queueJobId` ObjectId ref to this
collection for easy cross-lookup.

---

## Processor contract

**Processors MUST NOT import models or call DB operations directly.**
All persistence is delegated to the feature service's worker-callback methods.

```
Every processor follows this lifecycle:

  1. featureService.markProcessing(recordId)
  2. callApi(recordId, payload)       ← dev: mock response; prod: real HTTP call
  3. response.success = true  → featureService.markCompleted(recordId, outputUrl)
     response.success = false → featureService.markFailed(recordId, msg) + throw
     network / HTTP error     → featureService.markFailed(recordId, msg) + throw

  throw causes BullMQ to schedule a retry (up to 3×, exponential backoff).
  After 3 failures the job is permanently failed and the `failed` event fires.
```

### Dev vs prod API call

Each processor has an internal `callXxxApi` function that switches on `config.node_env`:

```ts
const callGenerationApi = async (recordId, payload): Promise<TJobResponse> => {
  if (config.node_env !== ENodeEnv.PROD) {
    // dev/test — no real HTTP call, return a deterministic mock
    return { success: true, outputUrl: `https://cdn.example.com/outputs/${recordId}.mp4` };
  }
  // prod — call the real external endpoint
  const res = await fetch(config.queue.external_api_url, { ... });
  return res.json();
};
```

The processor itself has no environment awareness — it just calls `callGenerationApi` and
handles `{ success, outputUrl?, message? }`.

---

## Config/queue/index.ts exports

| Export | Type | Purpose |
|--------|------|---------|
| `bullQueue` | `Queue` | BullMQ singleton — used internally by `QueueUtil` and `App/Queue/service` |
| `BullWorker` | Class | Worker wrapper — created once in `bootstrap.ts` |
| `QueueUtil` | Object | Feature-level interface — the only thing feature services need |

### QueueUtil methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `enqueue` | `(recordId, type, payload, opts?) → Promise<TEnqueueResult>` | Create MongoDB record + add to BullMQ |
| `getJobState` | `(recordId) → Promise<string \| null>` | Live BullMQ state |
| `remove` | `(recordId) → Promise<void>` | Remove job from BullMQ |
| `close` | `() → Promise<void>` | Graceful shutdown |

---

## Full Job Lifecycle

```
User → POST /generations (multipart)
  ↓
Controller: generate R2 keys (no upload yet)
  ↓
GenerationService.create()
  ├─ GenerationModel.create({ status: PENDING, ... })
  ├─ QueueUtil.enqueue(String(doc._id), QueueJobType.GENERATION, payload)
  │    ├─ QueueJobModel.create({ recordId, type, payload, status: PENDING })  ← MongoDB
  │    └─ bullQueue.add(recordId, data, { jobId: recordId })                 ← Redis/BullMQ
  └─ GenerationModel.findByIdAndUpdate(doc._id, { queueJobId })
  ↓
Controller uploads files to R2 (after successful enqueue)

───── Worker picks up job ──────────────────────────────────────────────────

BullWorker `active` event → QueueJobModel: status = PROCESSING, startedAt

handleGenerationJob(job)
  ├─ GenerationService.markProcessing(recordId)  → Generation: status = PROCESSING
  ├─ callGenerationApi(recordId, payload)
  │     dev  → mock { success: true, outputUrl: "cdn.example.com/..." }
  │     prod → POST QUEUE_EXTERNAL_API_URL → await { success, outputUrl?, message? }
  │
  ├─ success=true
  │     GenerationService.markCompleted(recordId, outputUrl)
  │     → Generation: status = COMPLETED, outputUrl, completedAt
  │
  └─ success=false OR network error
        GenerationService.markFailed(recordId, msg)
        → Generation: status = FAILED, errorMessage
        throw → BullMQ retries (attempt 2, then 3)

BullWorker `completed` event → QueueJobModel: status = COMPLETED, finishedAt
BullWorker `failed` event    → QueueJobModel: status = FAILED, failedReason, finishedAt
```

---

## App/Queue — REST API

HTTP endpoints for external services and admins (all `x-api-key` protected).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/queue` | Create and enqueue a raw job |
| `GET` | `/api/v1/queue` | List jobs (search, filter by status/type, sort, paginate) |
| `GET` | `/api/v1/queue/:id` | Get one `QueueJob` by MongoDB `_id` |
| `DELETE` | `/api/v1/queue/:id` | Cancel a pending job |

Source of truth: MongoDB `QueueJob` collection — full history, not limited by Redis TTL.

---

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `QUEUE_NAME` | `main-queue` | BullMQ queue name |
| `QUEUE_CONCURRENCY` | `1` | Jobs processed in parallel |
| `QUEUE_API_KEY` | — | API key for `/queue` REST endpoints |
| `QUEUE_EXTERNAL_API_URL` | — | External service URL (prod). Dev uses mock response. |

---

## Adding a New Queued Feature — Checklist

```
[ ] 1. Add QueueJobType.NEW_FEATURE = "new-feature" in Config/queue/const.ts

[ ] 2. Add worker-callback methods to the feature's service.ts:
        markProcessing(recordId)          — status → PROCESSING
        markCompleted(recordId, result)   — status → COMPLETED + save result fields
        markFailed(recordId, msg)         — status → FAILED + errorMessage

[ ] 3. Create Config/queue/processors/newFeature.processor.ts
        — internal callXxxApi() function: dev mock / prod HTTP (switch on config.node_env)
        — handleXxxJob(): markProcessing → callXxxApi → markCompleted | markFailed
        — NO direct DB access, NO model imports

[ ] 4. Register in processors/index.ts:
        case QueueJobType.NEW_FEATURE: return handleNewFeatureJob(job);

[ ] 5. Add queueJobId: ObjectId ref to the feature's Mongoose schema

[ ] 6. Update this file if the pattern changes.
```
