# Generation Request Flow

This document explains the complete lifecycle of a generation job — from the moment a user sends a request to the moment the output is ready. It covers the HTTP layer, the queue system, the worker, the external API integration, and the file tracking that happens at each stage.

---

## Overview

When a user submits a generation request, the server does not process the job immediately. Instead it creates a record, hands the job off to a background queue, responds to the user right away, and lets a worker process the heavy work asynchronously. The user polls the API to check progress.

There are two ways the external API can signal completion: it can respond synchronously while the worker waits, or it can call back to a dedicated webhook endpoint after processing finishes. Both paths are supported.

---

## Stage 1 — The User Sends a Request

The user calls `POST /api/v1/generations` with a multipart form body. The required fields are:

- `inputType` — either `text` or `audio`
- `voiceId` — the voice identifier to use
- `avatarImage` (file upload) or `avatarImageUrl` (a URL string) — the reference image. If both are provided the file takes precedence and the URL is ignored. If neither is provided the request is rejected with 400.
- `inputText` — required when `inputType` is `text`
- `inputAudio` (file upload, max 12 MB) — required when `inputType` is `audio`

The controller first validates all of this before touching the database or the queue.

---

## Stage 2 — Generating R2 Keys

If files were uploaded, the controller immediately generates the R2 destination keys — UUID-based paths like `generations/images/<uuid>.jpg` and `generations/audio/<uuid>.mp3`. No upload happens yet. The keys are generated now so the database record can reference the final R2 paths before the files are physically in storage. This is intentional: it allows the queue payload to carry the correct file paths from the start.

---

## Stage 3 — Creating the Database Record and Enqueueing

`GenerationService.create()` runs next. It creates a `Generation` document in MongoDB with `status: "pending"` and the R2 keys (or the provided URL) already stored as `avatarImage`.

Then `QueueUtil.enqueue()` is called. This does two things in order:

First, it creates a `QueueJob` document in MongoDB. This is a durable record of the job that persists even if Redis is restarted or flushed. It stores the job type, the `recordId` (the generation `_id`), and the full payload.

Second, it adds the job to BullMQ (backed by Redis) with the `recordId` used as the BullMQ job ID. Using our own ID means we can look up the BullMQ job by the MongoDB `_id` at any time without storing a separate mapping.

If the enqueue step fails for any reason, the `Generation` document is deleted immediately. Since no files have been uploaded to R2 yet at this point, there is nothing to clean up. The user receives a 500 and can retry.

If enqueue succeeds, the `QueueJob._id` is stored on the `Generation` document as `queueJobId` for cross-reference.

---

## Stage 4 — The 201 Response

As soon as the database record is created and the job is queued, **the server responds to the user with a 201**. The response includes the generation document with `status: "pending"`. The user does not wait for the job to be processed.

The response looks like:

```json
{
  "success": true,
  "message": "Generation job created.",
  "data": {
    "_id": "664f1b2c3e4a5b6c7d8e9f00",
    "status": "pending",
    "inputType": "text",
    "voiceId": "af_heart",
    "avatarImage": "generations/images/uuid.jpg",
    "inputText": "Say this calmly.",
    "createdAt": "2026-06-13T10:00:00.000Z"
  }
}
```

---

## Stage 5 — File Upload and Tracking (After Response)

After sending the 201, the controller uploads the actual files to R2. This happens after the response because it is the slow part — uploading files to object storage can take time — and there is no reason to make the user wait for it.

For each file that was uploaded, `FileService.track()` is called to create a `FileRecord` document in MongoDB. This gives the platform a central registry of every file in R2, linked to the generation that owns it via `ownerId`.

Once tracking completes, the returned `FileRecord._id` values are stored back on the `Generation` document as `refImageFile` and `audioFile`. These are optional reference fields — they exist for traceability and administrative purposes. They are set fire-and-forget and may not appear immediately on the 201 response if the upload takes a moment. A subsequent `GET /api/v1/generations/:id` will show them once they are set.

---

## Stage 6 — The Worker Picks Up the Job

The BullMQ worker runs continuously in the background. It is started once at server boot inside `bootstrap()`. When it picks up the generation job, two things happen in parallel through BullMQ's event system:

The `active` event fires on the `BullWorker` class, which updates the `QueueJob` document to `status: "processing"` and records `startedAt`.

The `handleGenerationJob()` processor function runs the actual job logic. It immediately calls `GenerationService.markProcessing(recordId)`, which updates the `Generation` document to `status: "processing"`. From this point the user can see the job is being worked on when they poll.

---

## Stage 7 — Calling the External API

The processor calls the external API by sending a `POST` request to the configured `QUEUE_EXTERNAL_API_URL` with:

- The `recordId` so the external service knows which job it is processing
- The full job payload (voice ID, input type, reference image path, input text or audio path)
- An `x-api-key` header for authentication

In development mode no real HTTP call is made. The processor returns a mock successful response immediately so the rest of the flow can be tested without a live external service.

The worker **waits synchronously** for the external API to respond. The worker thread is blocked on this call. BullMQ's concurrency setting controls how many jobs can be in this waiting state at once.

---

## Stage 8a — External API Responds with Success

If the external API responds with `{ success: true, outputUrl: "https://..." }`, the processor calls `GenerationService.markCompleted(recordId, outputUrl)`.

This method does the following:

1. Updates the `Generation` document — `status: "completed"`, `outputUrl` set, `completedAt` set. It intentionally fetches the pre-update document (`new: false`) so it has access to the `userId` for the next step.

2. Fire-and-forget: calls `FileService.track()` to create a `FileRecord` for the output file, linked to the generation via `ownerId`. The mime type is inferred from the file extension.

3. Fire-and-forget: stores the resulting `FileRecord._id` on the `Generation` document as `outputFile`.

BullMQ's `completed` event then fires on the `BullWorker` class, updating `QueueJob.status = "completed"` and `finishedAt`.

The user can now call `GET /api/v1/generations/:id` and see `status: "completed"` and the `outputUrl`.

---

## Stage 8b — External API Responds with Failure or Errors

If the external API responds with `{ success: false }`, or if the HTTP call itself throws (network error, timeout, non-2xx status), the processor calls `GenerationService.markFailed(recordId, message)`. This sets `status: "failed"` and stores the error message on the `Generation` document.

The processor then **throws an error**. This is intentional — throwing tells BullMQ that the job did not complete successfully, which triggers its retry mechanism.

BullMQ retries the job up to **3 times** with exponential backoff: 2 seconds, then 4 seconds, then 8 seconds. Each retry re-runs the full processor from the top — marking processing again, calling the external API again.

If all 3 attempts fail, BullMQ fires the `failed` event on the `BullWorker` class, which updates `QueueJob.status = "failed"`, `failedReason`, `attempts`, and `finishedAt`. The `Generation` document remains at `status: "failed"` with the last error message.

---

## Alternative — External API Calls Back Instead

The external API does not have to respond synchronously. If it is configured to do its work asynchronously and call back when done, it can `POST` to:

```
POST /api/v1/generations/:id/callback
```

This endpoint is secured by `x-api-key` only — no user JWT is required. The body is:

```json
{ "success": true, "outputUrl": "https://..." }
```

or

```json
{ "success": false }
```

The `handleCallback()` service method calls the same `markCompleted()` or `markFailed()` functions used by the worker. The result is identical — the `Generation` document ends up in the same state either way.

Note that when the callback path is used, BullMQ does not perform retries because the job processor already completed (the worker exited after calling the external API). Retry logic in the callback scenario must be handled by the external service itself.

---

## How the User Checks Progress

The user polls `GET /api/v1/generations/:id`. The `status` field moves through these states:

| Status | Meaning |
|--------|---------|
| `pending` | Job is queued, worker has not picked it up yet |
| `processing` | Worker is actively calling the external API |
| `completed` | Output is ready — `outputUrl` is set |
| `failed` | All retry attempts exhausted — `errorMessage` is set |
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
 │   ├─ GenerationModel.create()     → status: pending
 │   ├─ QueueJobModel.create()       → durable MongoDB record
 │   ├─ bullQueue.add()              → job in Redis/BullMQ
 │   └─ 201 ──────────────────────────────────────────► User receives response
 │
 │  Controller (after response, async):
 │   ├─ uploadFileToR2()             → files land in R2
 │   ├─ FileService.track()          → FileRecord created per file
 │   └─ GenerationService.setFileRefs() → refImageFile/audioFile stored
 │
 │  BullMQ Worker (background):
 │   ├─ active event → QueueJob: processing, startedAt
 │   ├─ markProcessing()             → Generation: processing
 │   ├─ POST external API            → awaiting response...
 │   │
 │   ├─ success=true
 │   │   ├─ markCompleted()          → Generation: completed, outputUrl, completedAt
 │   │   ├─ FileService.track(output)→ FileRecord for output file
 │   │   ├─ Generation.outputFile    → FileRecord._id stored
 │   │   └─ completed event → QueueJob: completed, finishedAt
 │   │
 │   └─ success=false / error
 │       ├─ markFailed()             → Generation: failed, errorMessage
 │       ├─ throw                    → BullMQ retries (×3, exponential backoff)
 │       └─ after 3 attempts: failed event → QueueJob: failed, failedReason
 │
 └─ GET /api/v1/generations/:id      → user polls for status / outputUrl
```

---

## File Structure Reference

```
src/App/Core/Generation/
  controller.ts         ← Stages 1–5: validation, DB create, enqueue, R2 upload, 201 response
  service.ts            ← Business logic: create, markProcessing, markCompleted, markFailed,
                           setFileRefs, handleCallback
  model.ts              ← Generation Mongoose schema
  routes.ts             ← Route definitions including /callback (x-api-key, no JWT)

src/Config/queue/
  index.ts              ← BullQueue, BullWorker class, QueueUtil.enqueue/remove
  processors/
    index.ts            ← Root processor — routes job.data.type to the right handler
    generation.processor.ts ← handleGenerationJob: calls external API, delegates to service

src/bootstrap.ts        ← Starts the BullMQ worker once at server boot
```
