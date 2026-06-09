# Queue Architecture

This document explains how the BullMQ-based queue system is structured, how jobs flow through it, and how feature modules connect to it.

---

## Overview

The queue system has two layers:

```
┌─────────────────────────────────────────────────────────┐
│  Config/queue/          INFRASTRUCTURE                  │
│  ├─ index.ts            BullMQ Queue + BullWorker +     │
│  │                      QueueUtil (all in one place)    │
│  ├─ const.ts            QueueJobType registry           │
│  ├─ types.ts            TQueueJobData, TEnqueueOptions  │
│  └─ processors/                                         │
│       ├─ index.ts       processQueueJob router          │
│       └─ generation.processor.ts                        │
├─────────────────────────────────────────────────────────┤
│  App/Queue/             REST API                        │
│  ├─ routes.ts           POST / GET / DELETE endpoints   │
│  ├─ controller.ts       HTTP handlers                   │
│  └─ service.ts          Reads job state from BullMQ     │
└─────────────────────────────────────────────────────────┘
```

> **Note:** There is no `Utils/queue/` layer. All queue code lives in `Config/queue/`. Feature modules import directly from `@/Config/queue`.

---

## Config/queue/index.ts

Exports three things:

| Export | Type | Purpose |
|--------|------|---------|
| `bullQueue` | `Queue` | Singleton BullMQ queue. Used internally by `QueueUtil` and directly by `App/Queue/service`. |
| `BullWorker` | Class | Wraps a BullMQ `Worker`. Created once in `bootstrap.ts`. |
| `QueueUtil` | Object | Feature-level interface — the only thing feature services need to import. |

**Connection** — shares the same Redis credentials as the main Redis client (`config.redis.*`).

**Default job options** (applied to all jobs unless overridden):

| Option | Value |
|--------|-------|
| `attempts` | 3 |
| `backoff` | exponential, 2 s base (2 s → 4 s → 8 s) |
| `removeOnComplete` | keep last 100 |
| `removeOnFail` | keep last 50 |

---

## Config/queue/const.ts — Job type registry

Single source of truth for all job type constants. **Update this file when adding a new queued feature.**

```ts
export const QueueJobType = {
  GENERATION: "generation",
  // Add new types here:
  // TRANSCRIPTION: "transcription",
} as const;
```

Both enqueuing (feature service) and routing (processor) import `QueueJobType` from here. TypeScript will reject unknown values at every call site.

---

## Config/queue/types.ts

| Type | Shape |
|------|-------|
| `TQueueJobData` | `{ type: TQueueJobType; recordId: string; payload: Record<string, unknown> }` |
| `TEnqueueOptions` | `{ priority?, delay?, attempts? }` |
| `TProcessor<T>` | `(job: Job<T>) => Promise<void>` |

`type` is a **top-level typed discriminant** — never inside `payload`. The processor reads `job.data.type` directly.

---

## Config/queue/processors/index.ts — Job router

The single entry point for the BullMQ worker. Routes every job to the correct feature handler by reading `job.data.type`.

```
processQueueJob(job)
  ├─ reads job.data.type  (TQueueJobType — fully typed, no cast)
  ├─ "generation"  → handleGenerationJob(job)
  └─ (unknown)     → forward raw to external API
```

### Processor contract — DB operations rule

**Processors MUST NOT perform direct database operations.**

All persistence is delegated to the owning feature's service via worker-callback methods:

```
Processor role:
  1. Call featureService.markProcessing(recordId)
  2. Call external API
  3. On success → featureService.markCompleted(recordId, result)
  4. On failure → featureService.markFailed(recordId, errorMessage)
                  then throw  ← BullMQ retries

Service role:
  markProcessing / markCompleted / markFailed
  — these are the ONLY DB methods the processor is allowed to call.
  — they live in the feature's service.ts, never in the processor.
```

---

## QueueUtil — Feature-level interface

The only import a feature service needs:

```ts
import { QueueUtil } from "@/Config/queue";
import { QueueJobType } from "@/Config/queue/const";

const job = await QueueUtil.enqueue(
  String(doc._id),         // recordId — MongoDB _id of the feature record
  QueueJobType.GENERATION, // type — typed constant, separate from payload
  { userId, inputType, ... }, // payload — feature-specific data (no type here)
  { priority: 1 },         // options — optional
);
```

| Method | Signature | Purpose |
|--------|-----------|---------|
| `enqueue` | `(recordId, type, payload, opts?)` | Add a job to the queue |
| `getJobState` | `(bullJobId)` | Get current BullMQ state string |
| `remove` | `(bullJobId)` | Remove a pending job |
| `close` | `()` | Graceful shutdown |

---

## App/Queue — REST API

Provides HTTP endpoints for external services to manage jobs directly (API-key protected).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/queue` | Create and enqueue a raw job |
| `GET` | `/api/v1/queue` | List jobs with search, filter, sort, pagination |
| `GET` | `/api/v1/queue/:jobId` | Get job state by BullMQ job ID |
| `DELETE` | `/api/v1/queue/:jobId` | Remove a job |

**Auth:** `x-api-key` header (see `Middlewares/ApiKey`).

**List supports:** `search` (recordId / bullJobId), `status`, `type`, `page`, `limit`, `sortBy`, `sortOrder`.

> `App/Queue` reads job state live from BullMQ (Redis). There is no MongoDB model for raw queue jobs. Business history lives in each feature's own model.

---

## Full Job Lifecycle

```
User → POST /generations
  ↓
GenerationService.create()
  ├─ GenerationModel.create({ status: PENDING, bullJobId: "pending" })
  ├─ QueueUtil.enqueue(recordId, QueueJobType.GENERATION, { userId, ... })  → BullMQ
  └─ doc.bullJobId = job.id;  doc.save()

BullMQ (Redis) holds the job until the worker is free
  ↓
BullWorker.start()  (bootstrap.ts)
  ↓
processQueueJob(job)   ← Config/queue/processors/index.ts
  switch(job.data.type)
  ↓
handleGenerationJob(job)   ← Config/queue/processors/generation.processor.ts
  ├─ GenerationService.markProcessing(recordId)   → MongoDB: status = PROCESSING
  ├─ fetch(external AI API)
  │    ├─ success → GenerationService.markCompleted(recordId, { audioUrl, videoUrl, ysid })
  │    │            → MongoDB: status = COMPLETED + result fields
  │    └─ failure → GenerationService.markFailed(recordId, errorMessage)
  │                 → MongoDB: status = FAILED + errorMessage
  │                 → throw  ← BullMQ retries (up to 3×)
  └─ done
```

---

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `QUEUE_NAME` | `main-queue` | BullMQ queue name |
| `QUEUE_CONCURRENCY` | `1` | Jobs processed in parallel (1 = sequential) |
| `QUEUE_API_KEY` | — | Required — API key for `/queue` REST endpoints |
| `QUEUE_EXTERNAL_API_URL` | — | Required — URL the processor POSTs jobs to |

**Concurrency is 1 by design** — AI generation jobs are resource-intensive. Raise `QUEUE_CONCURRENCY` only if the external AI service can handle parallel requests.

---

## Adding a New Queued Feature — Checklist

```
[ ] 1. Add QueueJobType.NEW_FEATURE = "new-feature"  in Config/queue/const.ts

[ ] 2. Add worker-callback methods to the feature's service.ts:
        markProcessing(recordId)
        markCompleted(recordId, result)
        markFailed(recordId, errorMessage)
        — DB operations ONLY here, never in the processor.

[ ] 3. Create Config/queue/processors/newFeature.processor.ts
        import { NewFeatureService } from "@/App/Core/NewFeature/service"
        — calls service methods, no direct DB access.

[ ] 4. Register in processors/index.ts:
        import { handleNewFeatureJob } from "./newFeature.processor";
        case QueueJobType.NEW_FEATURE: return handleNewFeatureJob(job);

[ ] 5. Update docs/architecture/queue.md if the pattern changes.
```
