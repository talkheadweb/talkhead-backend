# Queue Architecture

This document explains how the BullMQ-based queue system is structured, how jobs flow through it, and how feature modules connect to it.

---

## Overview

The queue system has two layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Config/queue/          INFRASTRUCTURE                      │
│  ├─ index.ts            BullMQ Queue + BullWorker +         │
│  │                      QueueUtil + QueueJobModel export    │
│  ├─ const.ts            QueueJobType + QueueJobStatus       │
│  ├─ model.ts            QueueJob MongoDB model (persistent) │
│  ├─ types.ts            TQueueJobData, TEnqueueOptions,     │
│  │                      IQueueJob, TEnqueueResult           │
│  └─ processors/                                             │
│       ├─ index.ts       processQueueJob router              │
│       └─ generation.processor.ts                            │
├─────────────────────────────────────────────────────────────┤
│  App/Queue/             REST API (admin-facing)             │
│  ├─ routes.ts           POST / GET / DELETE endpoints       │
│  ├─ controller.ts       HTTP handlers                       │
│  └─ service.ts          Reads / writes QueueJob MongoDB     │
└─────────────────────────────────────────────────────────────┘
```

---

## Persistent Job Store — QueueJob Model

BullMQ stores jobs in Redis, which is not durable. Every call to `QueueUtil.enqueue` also creates a `QueueJob` document in MongoDB, so the full job history survives Redis restarts, pod recycling, or queue flushes.

`QueueJob` fields:

| Field | Type | Description |
|-------|------|-------------|
| `recordId` | string | Feature document `_id` (e.g. `Generation._id`) — link back to the owning record |
| `type` | `TQueueJobType` | Job type constant from `QueueJobType` |
| `payload` | object | Full job payload at enqueue time |
| `status` | enum | `pending → processing → completed \| failed \| cancelled` |
| `bullJobId` | string? | BullMQ cache ID — informational only, not used for business logic |
| `attempts` | number | Retry count (updated by `BullWorker` `failed` event) |
| `failedReason` | string? | Set on failure |
| `startedAt` | Date? | When `active` event fires |
| `finishedAt` | Date? | When `completed` or `failed` event fires |

Feature documents (e.g. `Generation`) store a `queueJobId` ObjectId reference to this collection for easy cross-lookup.

---

## Config/queue/index.ts

Exports:

| Export | Type | Purpose |
|--------|------|---------|
| `bullQueue` | `Queue` | Singleton BullMQ queue — used internally by `QueueUtil` and directly by `App/Queue/service`. |
| `BullWorker` | Class | Wraps a BullMQ `Worker`. Created once in `bootstrap.ts`. Updates `QueueJob` on `active` / `completed` / `failed` events. |
| `QueueUtil` | Object | Feature-level interface — the only thing feature services need to import. |
| `QueueJobModel` | Model | Re-exported for `App/Queue/service` to read job history. |

**Connection** — shares the same Redis credentials as the main Redis client (`config.redis.*`).

**Default job options** (applied to all jobs unless overridden):

| Option | Value |
|--------|-------|
| `attempts` | 3 |
| `backoff` | exponential, 2 s base (2 s → 4 s → 8 s) |
| `removeOnComplete` | keep last 100 |
| `removeOnFail` | keep last 50 |

---

## Config/queue/const.ts — Type + status registry

```ts
// Job type — add one entry per queued feature
export const QueueJobType = {
  GENERATION: "generation",
} as const;

// Job status — mirrors BullMQ lifecycle in MongoDB
export const QueueJobStatus = {
  PENDING   : "pending",
  PROCESSING: "processing",
  COMPLETED : "completed",
  FAILED    : "failed",
  CANCELLED : "cancelled",
} as const;
```

---

## Config/queue/types.ts

| Type | Shape |
|------|-------|
| `TQueueJobData` | `{ type, recordId, payload }` |
| `TEnqueueOptions` | `{ priority?, delay?, attempts? }` |
| `TEnqueueResult` | `{ queueJobId: Types.ObjectId }` |
| `IQueueJob` | Full QueueJob document shape |
| `TProcessor<T>` | `(job: Job<T>) => Promise<void>` |

---

## QueueUtil — Feature-level interface

```ts
import { QueueUtil } from "@/Config/queue";
import { QueueJobType } from "@/Config/queue/const";

const { queueJobId } = await QueueUtil.enqueue(
  String(doc._id),           // recordId — MongoDB _id of the feature record
  QueueJobType.GENERATION,   // type — typed constant, separate from payload
  { userId, voiceId, ... },  // payload — feature-specific data
  { priority: 1 },           // options — optional
);
// queueJobId is the MongoDB _id of the created QueueJob document
```

`enqueue` internally:
1. Creates `QueueJob` document in MongoDB (status: pending)
2. Adds to BullMQ with `jobId = recordId` (our ID, not BullMQ auto-increment)
3. Saves BullMQ's `bullJobId` back onto the `QueueJob` (fire-and-forget)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `enqueue` | `(recordId, type, payload, opts?) → Promise<TEnqueueResult>` | Create DB record + add to BullMQ |
| `getJobState` | `(recordId) → Promise<string \| null>` | Current BullMQ state string |
| `remove` | `(recordId) → Promise<void>` | Remove a job from BullMQ |
| `close` | `() → Promise<void>` | Graceful shutdown |

---

## Config/queue/processors/index.ts — Job router

Routes every job to the correct feature handler by reading `job.data.type`:

```
processQueueJob(job)
  ├─ reads job.data.type  (TQueueJobType — fully typed)
  ├─ "generation"  → handleGenerationJob(job)
  └─ (unknown)     → forward raw to external API
```

### Processor contract

**Processors MUST NOT perform direct database operations.**

```
Processor role:
  1. featureService.markProcessing(recordId)
  2. Call external API (fire-and-forget or await acknowledgement)
  3. On API error → featureService.markFailed(recordId, msg) + throw  ← BullMQ retries
  
  Note: markCompleted is NOT called by the processor.
        Completion arrives via a callback webhook from the external service.
```

---

## App/Queue — REST API

Provides HTTP endpoints for external services / admins (API-key protected).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/queue` | Create and enqueue a raw job |
| `GET` | `/api/v1/queue` | List jobs from MongoDB (search, filter, sort, pagination) |
| `GET` | `/api/v1/queue/:id` | Get one `QueueJob` by MongoDB `_id` |
| `DELETE` | `/api/v1/queue/:id` | Cancel a job (MongoDB + best-effort BullMQ removal) |

**Auth:** `x-api-key` header.
**Source of truth:** MongoDB `QueueJob` collection — full history, not limited to Redis TTL.

---

## Full Job Lifecycle

```
User → POST /generations (multipart)
  ↓
GenerationService.create(userId, body, { refImageKey, audioKey })
  ├─ GenerationModel.create({ status: PENDING, ... })
  ├─ QueueUtil.enqueue(String(doc._id), QueueJobType.GENERATION, payload)
  │    ├─ QueueJobModel.create({ recordId, type, payload, status: PENDING })  ← MongoDB
  │    └─ bullQueue.add(recordId, data, { jobId: recordId })                 ← Redis
  └─ GenerationModel.findByIdAndUpdate(doc._id, { queueJobId })
  ↓ (controller uploads files to R2 after successful enqueue)

BullWorker `active` event → QueueJobModel: status = PROCESSING, startedAt

BullWorker picks up job → handleGenerationJob(job)
  ├─ GenerationService.markProcessing(recordId)
  └─ POST to Kokoro { recordId, payload }
       accepted → done, awaiting callback
       error    → GenerationService.markFailed + throw → BullMQ retries (up to 3×)

BullWorker `completed` event → QueueJobModel: status = COMPLETED, finishedAt
BullWorker `failed` event    → QueueJobModel: status = FAILED, failedReason, finishedAt

Kokoro backend → POST /api/v1/generations/:id/callback { success, outputUrl? }
  → GenerationService.handleCallback()
       success=true  → markCompleted → Generation: status = COMPLETED, outputUrl
       success=false → markFailed   → Generation: status = FAILED
```

---

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `QUEUE_NAME` | `main-queue` | BullMQ queue name |
| `QUEUE_CONCURRENCY` | `1` | Jobs processed in parallel |
| `QUEUE_API_KEY` | — | Required — API key for `/queue` REST endpoints and `/callback` webhook |
| `QUEUE_EXTERNAL_API_URL` | — | Required — URL the processor POSTs jobs to |

---

## Adding a New Queued Feature — Checklist

```
[ ] 1. Add QueueJobType.NEW_FEATURE = "new-feature" in Config/queue/const.ts

[ ] 2. Add worker-callback methods to the feature's service.ts:
        markProcessing(recordId)     — status → PROCESSING
        markCompleted(recordId, ...) — status → COMPLETED (called from callback webhook)
        markFailed(recordId, msg)    — status → FAILED

[ ] 3. Create Config/queue/processors/newFeature.processor.ts
        — calls markProcessing, calls external API, calls markFailed on error
        — NO markCompleted here (completion arrives via callback webhook)
        — NO direct DB access

[ ] 4. Register in processors/index.ts:
        case QueueJobType.NEW_FEATURE: return handleNewFeatureJob(job);

[ ] 5. Add POST /:id/callback route to the feature's router
        — secured by apiKeyAuth (no JWT)
        — calls service.handleCallback()

[ ] 6. Add queueJobId: ObjectId ref to the feature's schema

[ ] 7. Update docs/architecture/queue.md if the pattern changes.
```
