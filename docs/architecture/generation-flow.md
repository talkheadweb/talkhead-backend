# Generation Request Flow

This document explains the complete lifecycle of a generation job — from the moment a user sends a request to the moment the output is ready. It covers the HTTP layer, the queue system, the worker, the external API integration, and the file tracking that happens at each stage.

---

## Overview

When a user submits a generation request, the server does not process the job immediately. Instead it creates a record, hands the job off to a background queue, responds to the user right away, and lets a worker fire a trigger to the external API. The external API processes asynchronously and calls back when done. The user polls the API to check progress.

The worker uses a **fire-and-forget trigger** pattern — it sends the job payload to the external API and exits as soon as the trigger is accepted. It does not sit waiting for the generation to finish. This keeps the worker thread free and avoids timeout issues on long-running jobs.

---

## Stage 1 — The User Sends a Request

The user calls `POST /api/v1/generations` with a multipart form body. The required fields are:

- `inputType` — either `text` or `audio`
- `voiceId` — the voice identifier to use
- `avatarImage` (file upload) or `avatarImageUrl` (a URL string) — the reference image. If both are provided the file takes precedence and the URL is ignored. If neither is provided the request is rejected with 400.
- `inputText` — required when `inputType` is `text`
- `inputAudio` (file upload, max 12 MB) — required when `inputType` is `audio`

The controller validates all of this before touching the database or the queue.

---

## Stage 2 — Generating R2 Keys

If files were uploaded, the controller immediately generates the R2 destination keys — UUID-based paths like `generations/images/<uuid>.jpg` and `generations/audio/<uuid>.mp3`. No upload happens yet. The keys are generated now so the database record can reference the final R2 paths before the files are physically in storage. This allows the queue payload to carry the correct file paths from the start.

---

## Stage 3 — Creating the Database Record and Enqueueing

`GenerationService.create()` runs next. It creates a `Generation` document in MongoDB with `status: "pending"` and the R2 keys (or the provided URL) stored as `avatarImage`.

Then `QueueUtil.enqueue()` is called. This does two things in order:

First, it creates a `QueueJob` document in MongoDB. This is a durable record of the job that persists even if Redis is restarted or flushed. It stores the job type, the `recordId` (the generation `_id`), and the full payload.

Second, it adds the job to BullMQ (backed by Redis) with the `recordId` used as the BullMQ job ID. Using our own ID means we can look up the BullMQ job by the MongoDB `_id` at any time without storing a separate mapping.

If the enqueue step fails for any reason, the `Generation` document is deleted immediately. Since no files have been uploaded to R2 yet at this point, there is nothing to clean up.

If enqueue succeeds, the `QueueJob._id` is stored on the `Generation` document as `queueJobId` for cross-reference.

---

## Stage 4 — The 201 Response

As soon as the database record is created and the job is queued, **the server responds to the user with a 201**. The response includes the generation document with `status: "pending"`. The user does not wait for the job to be processed.

---

## Stage 5 — File Upload and Tracking (After Response)

After sending the 201, the controller uploads the actual files to R2. This happens after the response because uploading to object storage can take time and there is no reason to make the user wait.

For each file uploaded, `FileService.track()` is called to create a `FileRecord` document in MongoDB — a central registry of every file in R2, linked to the generation via `ownerId`.

Once tracking completes, the returned `FileRecord._id` values are stored on the `Generation` document as `refImageFile` and `audioFile` (fire-and-forget). They may not appear on the immediate 201 response but will be present on a subsequent `GET /api/v1/generations/:id`.

---

## Stage 6 — The Worker Fires the Trigger

The BullMQ worker runs continuously in the background, started once at server boot inside `bootstrap()`. When it picks up the generation job:

**BullMQ `active` event** — updates `QueueJob.status = "processing"` and records `startedAt`.

**`handleGenerationJob()` processor:**

1. Calls `GenerationService.markProcessing(recordId)` → `Generation.status = "processing"`
2. Sends a `POST` trigger to the external API with `{ recordId, callbackUrl, payload }`
3. **Waits only for the trigger to be accepted (2xx response)** — then exits immediately
4. Does not wait for the actual generation result

The external API is expected to respond `2xx` quickly (it just needs to accept the job), then do the heavy work asynchronously on its own.

**BullMQ `completed` event** fires as soon as the processor exits — updates `QueueJob.status = "completed"`.

If the trigger request fails (external API down, non-2xx, network error), the processor calls `markFailed` and throws. BullMQ retries up to **3 times** with exponential backoff (2 s → 4 s → 8 s). After all retries exhausted, `QueueJob.status = "failed"` and `Generation.status = "failed"`.

---

## Stage 7 — The External API Processes and Calls Back

The external API receives the trigger, processes the generation job asynchronously, and when done sends a `POST` request to the `callbackUrl` that was included in the trigger.

The callback body:

```json
{ "success": true,  "outputUrl": "https://cdn.example.com/result.mp4" }
{ "success": false, "message": "GPU out of memory" }
```

This is handled by `POST /api/v1/generations/:id/callback` — a plain HTTP endpoint secured by `x-api-key`. No BullMQ queue is involved for the callback. The callback handler is fast (a DB update + fire-and-forget file tracking) so a queue is unnecessary overhead.

See [`docs/architecture/external-api-contract.md`](external-api-contract.md) for the full integration spec to share with the external API team.

---

## Stage 8a — Callback: Success

`handleCallback()` in `GenerationService` calls `markCompleted(id, outputUrl)`:

1. Updates `Generation` → `status: "completed"`, `outputUrl`, `completedAt`
2. Fire-and-forget: `FileService.track()` creates a `FileRecord` for the output file
3. Fire-and-forget: stores `FileRecord._id` as `Generation.outputFile`

The user can now call `GET /api/v1/generations/:id` and see `status: "completed"` and the `outputUrl`.

---

## Stage 8b — Callback: Failure

`handleCallback()` calls `markFailed(id, message)`:

- `Generation.status = "failed"`
- `Generation.errorMessage = body.message` (or a default if not provided)

The user will see `status: "failed"` and `errorMessage` when they poll.

Note: BullMQ does not retry on callback failure — the worker already exited successfully after the trigger was accepted. Retry logic for the generation itself must be handled by the external API.

---

## How the User Checks Progress

The user polls `GET /api/v1/generations/:id`. The `status` field moves through these states:

| Status | Meaning |
|--------|---------|
| `pending` | Job is queued, worker has not picked it up yet |
| `processing` | Trigger sent to external API — awaiting callback |
| `completed` | Output is ready — `outputUrl` is set |
| `failed` | Trigger failed after all retries, or callback reported failure — `errorMessage` is set |
| `cancelled` | User cancelled the job while it was still `pending` |

A job can only be cancelled while it is `pending`. Once a worker picks it up and sets it to `processing`, cancellation is no longer possible.

---

## Full Sequence Diagram

```
User
 │
 ├─ POST /api/v1/generations (multipart)
 │
 │  Controller:
 │   ├─ Validate inputs
 │   ├─ Generate R2 keys (no upload yet)
 │   ├─ GenerationModel.create()          → status: pending
 │   ├─ QueueJobModel.create()            → durable MongoDB record
 │   ├─ bullQueue.add()                   → job in Redis/BullMQ
 │   └─ 201 ──────────────────────────────────────────────► User receives response
 │
 │  Controller (after response, async):
 │   ├─ uploadFileToR2()                  → files land in R2
 │   ├─ FileService.track()              → FileRecord created per file
 │   └─ GenerationService.setFileRefs()  → refImageFile / audioFile stored
 │
 │  BullMQ Worker (background):
 │   ├─ active event  → QueueJob: processing, startedAt
 │   ├─ markProcessing()                  → Generation: processing
 │   ├─ POST external API { recordId, callbackUrl, payload }
 │   ├─ 2xx received → exit              (fire-and-forget — does not wait for result)
 │   └─ completed event → QueueJob: completed
 │
 │     ── if trigger fails (non-2xx / network error): ──
 │   ├─ markFailed()                      → Generation: failed, errorMessage
 │   ├─ throw → BullMQ retries (×3, exponential backoff)
 │   └─ after 3 attempts: QueueJob: failed, failedReason
 │
 │  External API (async — takes as long as it needs):
 │   ├─ processes job...
 │   └─ POST /api/v1/generations/:id/callback
 │       { success: true,  outputUrl: "..." }
 │       { success: false, message:  "..." }
 │
 │  Callback handler (direct HTTP endpoint — no queue):
 │   ├─ success=true
 │   │   ├─ markCompleted()              → Generation: completed, outputUrl, completedAt
 │   │   ├─ FileService.track(output)   → FileRecord for output file
 │   │   └─ Generation.outputFile       → FileRecord._id stored
 │   │
 │   └─ success=false
 │       └─ markFailed()                → Generation: failed, errorMessage
 │
 └─ GET /api/v1/generations/:id         → user polls for status / outputUrl
```

---

## File Structure Reference

```
src/App/Core/Generation/
  controller.ts     ← Stages 1–5: validation, DB create, enqueue, R2 upload, 201 response
  service.ts        ← markProcessing, markCompleted, markFailed, setFileRefs, handleCallback
  routes.ts         ← Route definitions including /callback (x-api-key, no JWT)
  validation.ts     ← callbackGenerationSchema: success (bool), outputUrl?, message?

src/Config/queue/
  index.ts                           ← BullQueue, BullWorker class, QueueUtil.enqueue/remove
  processors/
    index.ts                         ← Root processor — routes job.data.type to handler
    generation.processor.ts          ← markProcessing → triggerExternalApi → exit

src/bootstrap.ts    ← Starts the BullMQ worker once at server boot

docs/architecture/
  external-api-contract.md  ← Full integration spec for the external API team
```
