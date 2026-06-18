# External API Integration Contract

This document defines the full integration contract between this platform and the external generation API. Share this with the team building the external service.

---

## How the Integration Works

The integration uses a **fire-and-forget + callback** pattern. Neither side blocks waiting for the other to finish.

1. Our server sends a trigger request to the external API with the job payload.
2. The external API accepts the trigger immediately (responds 2xx) and begins processing asynchronously.
3. When processing finishes, the external API sends a callback request to our server with the result.

This keeps both sides non-blocking and handles long-running generation jobs cleanly.

---

## Step 1 — Trigger Request (Our Server → External API)

When a generation job is ready, our server sends the following request.

**Method:** `POST`

**URL:** Configured on our side as `QUEUE_EXTERNAL_API_URL` (your team provides this URL).

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `x-api-key` | Shared secret — your team receives this from us as `QUEUE_API_KEY` |

**Body:**

```json
{
  "recordId"   : "664f1b2c3e4a5b6c7d8e9f00",
  "callbackUrl": "https://api.yourdomain.com/api/v1/generations/664f1b2c3e4a5b6c7d8e9f00/callback",
  "payload"    : {
    "voiceId"     : "af_heart",
    "inputType"   : "text",
    "avatarImageKey": "generations/images/uuid.jpg",
    "inputText"   : "Say this calmly.",
    "inputAudioKey": null
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `recordId` | `string` | Our internal MongoDB ID for this generation job. Include it in your callback. |
| `callbackUrl` | `string` | The exact URL your server must POST the result to when done. |
| `payload.voiceId` | `string` | The voice identifier to use for generation. |
| `payload.inputType` | `"text" \| "audio"` | Determines which input field to use. |
| `payload.avatarImageKey` | `string` | R2 file key or full URL of the reference avatar image. |
| `payload.inputText` | `string \| null` | Text input — present when `inputType` is `text`. |
| `payload.inputAudioKey` | `string \| null` | R2 file key of the audio input — present when `inputType` is `audio`. |

**Expected response from your server:**

Respond with any `2xx` status to confirm the trigger was received. Our server does not read the response body. If your server responds with a non-2xx status or does not respond at all, we will retry the trigger up to 3 times with exponential backoff (2 s, 4 s, 8 s). After 3 failed attempts the job is marked as failed on our side.

```json
{ "accepted": true }
```

or simply `200 OK` with an empty body — either is fine.

---

## Step 1b — Upload the Output File (External API → Our Server)

Before sending the callback, upload the generated output file to our storage. This keeps the file in our private R2 bucket and ensures proper tracking. Use the `fileKey` from the response as `outputFileKey` in your callback.

**Method:** `POST`

**URL:** `{BACKEND_BASE_URL}/api/v1/files/external-upload`

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `multipart/form-data` |
| `x-api-key` | The shared secret — same key used for the callback |

**Body:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | binary | ✅ | The generated output file — video or audio, up to 200 MB |
| `generationId` | `string` | ✅ | The `recordId` from the trigger body — always used to link the file to its generation |
| `ownerId` | `string` | ☐ optional | An alternative owner document ID. If provided, takes precedence over `generationId` as the `ownerId` on the file record. If omitted, `generationId` is used as the owner. |

**Supported file types:** MP4, MOV, WebM, AVI, MPEG (video) · MP3, WAV, M4A (audio)

**Size limit:** 200 MB

**Example response:**

```json
{
  "success": true,
  "message": "File uploaded.",
  "data": {
    "_id": "664f1b2c3e4a5b6c7d8e9f10",
    "type": "generation",
    "folder": "generations/output",
    "fileKey": "generations/output/550e8400-e29b-41d4-a716-446655440000.mp4",
    "fileUrl": "https://r2.example.com/generations/output/550e8400.mp4?presigned=...",
    "originalName": "output.mp4",
    "mimeType": "video/mp4",
    "fileSize": 12582912
  }
}
```

Use `data.fileKey` as the `outputFileKey` value in your callback (Step 2). Our server looks up the FileRecord by key and links it to the generation automatically.

---

## Step 2 — Callback Request (External API → Our Server)

When your processing is complete — whether successful or not — send a `POST` request to the `callbackUrl` you received in the trigger.

**Method:** `POST`

**URL:** The exact `callbackUrl` from the trigger body.

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `x-api-key` | The same shared secret we sent you. We validate this on the callback endpoint. |

**Body — success case:**

```json
{
  "success"      : true,
  "outputFileKey": "generations/output/550e8400-e29b-41d4-a716-446655440000.mp4"
}
```

**Body — failure case:**

```json
{
  "success": false,
  "message": "GPU out of memory — job could not be completed"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | `boolean` | ✅ | `true` if generation completed successfully, `false` otherwise |
| `outputFileKey` | `string` | Required when `success=true` | The `fileKey` value returned by `POST /api/v1/files/external-upload`. Our server builds the CDN URL from this key and stores it. |
| `message` | `string` | Required when `success=false` | Human-readable reason for failure. Stored on the record. |

**Our server's response to your callback:**

```json
{ "success": true, "message": "Callback processed." }
```

If we respond with `4xx`, check the table below. If we respond with `5xx`, you may retry the callback.

| Status | Meaning |
|--------|---------|
| `200` | Callback accepted and processed |
| `400` | Invalid body — check that `success` is a boolean and `outputFileKey` is a non-empty string |
| `401` | Missing `x-api-key` header |
| `403` | Wrong `x-api-key` value |
| `404` | `recordId` not found — do not retry |

---

## Authentication

Both directions use the same shared `x-api-key` secret. We send it on the trigger; you echo it back on the callback. We validate it on our end before processing the callback.

The key is provided to your team out-of-band (not in this document). Keep it secret — treat it like a password.

---

## File Access

The `avatarImage` field in the trigger payload may be either:

- A **full public URL** (e.g. `https://cdn.example.com/ref.jpg`) — fetch it directly
- A **bare R2 file key** (e.g. `generations/images/uuid.jpg`) — contact us for a presigned URL if needed

Do **not** send a URL back in the callback. Instead, upload the file to `/files/external-upload` (Step 1b) and send the returned `fileKey` as `outputFileKey` in your callback. Our server stores the key and generates presigned URLs for end users at response time.

---

## Timing

There is no timeout enforced on our side for how long you take to call back. The generation record will remain in `status: "processing"` until the callback arrives. However, we recommend calling back within a reasonable window (e.g. 10 minutes) so users get timely feedback.

If your service crashes mid-job and cannot call back, the generation will remain stuck at `processing`. In that case, use the admin API (`PATCH /api/v1/generations/:id`) to manually set the status, or contact us to reset it.

---

## Retry Guidance

| Scenario | Who retries | How |
|----------|-------------|-----|
| Trigger fails (your server is down) | Our server (BullMQ) | 3 attempts, exponential backoff: 2 s → 4 s → 8 s |
| Trigger times out | Our server | Same as above |
| Callback fails (our server returns 5xx) | Your server | Retry with reasonable backoff; stop on 4xx |
| Callback not received | Neither | Generation stays at `processing` — admin must intervene |

---

## Full Example Sequence

```
Our server                              External API
    │                                       │
    │  POST /your-endpoint                  │
    │  { recordId, callbackUrl, payload }   │
    │  x-api-key: <secret>                  │
    │ ─────────────────────────────────────►│
    │                                       │ begins async processing
    │◄─────────────────────────────────────┤
    │  200 OK  { "accepted": true }         │
    │                                       │ ... processing takes N seconds ...
    │                                       │
    │  POST /api/v1/files/external-upload   │
    │  multipart: file=<output>, generationId=<recordId> │
    │  x-api-key: <secret>                  │
    │◄─────────────────────────────────────┤
    │                                       │
    │  201 Created { fileKey: "generations/output/uuid.mp4" } │
    │ ─────────────────────────────────────►│
    │                                       │
    │  POST /api/v1/generations/:id/callback│
    │  { success: true, outputFileKey: "generations/output/uuid.mp4" } │
    │  x-api-key: <secret>                  │
    │◄─────────────────────────────────────┤
    │                                       │
    │  200 OK  { "success": true, ... }     │
    │ ─────────────────────────────────────►│
    │                                       │
    │  (record updated: status=completed)   │
```

---

## Environment URLs

| Environment | Callback base URL |
|-------------|-------------------|
| Development | `http://localhost:9000` |
| Production | Set in `BACKEND_BASE_URL` env var — your team will receive this |

The full callback URL is always:

```
{BACKEND_BASE_URL}/api/v1/generations/{recordId}/callback
```

This is also passed directly in every trigger request as `callbackUrl` so you do not need to construct it yourself.

---

## Summary Checklist for the External API Team

- [ ] Receive `POST` triggers at your endpoint, respond `2xx` immediately
- [ ] Read `recordId`, `callbackUrl`, and `payload` from the trigger body
- [ ] Validate the incoming `x-api-key` header on your trigger endpoint
- [ ] Process the generation job asynchronously
- [ ] On completion, upload the output file to `POST /api/v1/files/external-upload` — include `x-api-key` and pass `generationId = recordId`
- [ ] Use the returned `fileKey` as `outputFileKey` in the callback
- [ ] `POST` to the exact `callbackUrl` with `{ success: true, outputFileKey }` or `{ success: false, message }`
- [ ] Include the `x-api-key` header on your callback request
- [ ] On our `5xx` response, retry the callback with backoff
- [ ] On our `4xx` response, do not retry — fix the request body
