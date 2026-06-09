/*
  OpenAPI path definitions for the Queue module.

  Uses the builder DSL from @/Config/swagger/helpers.
  All endpoints are protected by x-api-key header (API key auth).
*/

import {
  created,
  enumOf,
  errors,
  jsonBody,
  ok,
  paginationParams,
  queryParam,
  sortParams,
  str,
  withTag,
} from "@/Config/swagger/helpers";
import { QueueJobType } from "@/Config/queue/const";
import { QueueJobStatuses } from "./types";

const { post, get, del } = withTag("Queue");

// ── Reusable fragments ─────────────────────────────────────────────────────
const queueJobTypeValues = Object.values(QueueJobType);

const apiKeyHeader = {
  in: "header", name: "x-api-key", required: true,
  schema: { type: "string" },
  description: "API key issued to the external service",
};

const jobIdPath = {
  in: "path", name: "jobId", required: true,
  schema: { type: "string" },
  description: "BullMQ job ID returned from POST /queue",
};

// Actual data shape returned by GET /queue and GET /queue/:jobId
const queueJobSchema = {
  type      : "object",
  properties: {
    bullJobId   : str({ example: "42" }),
    recordId    : str({ example: "QJ-a1b2c3d4" }),
    type        : enumOf(queueJobTypeValues, { example: queueJobTypeValues[0] }),
    status      : enumOf([...QueueJobStatuses]),
    payload     : { type: "object", additionalProperties: true },
    attempts    : { type: "integer", example: 0 },
    createdAt   : { type: "string", format: "date-time" },
    processedAt : { type: "string", format: "date-time", nullable: true },
    finishedAt  : { type: "string", format: "date-time", nullable: true },
    failedReason: { type: "string", nullable: true },
  },
};

// ── List query parameters ──────────────────────────────────────────────────
const queueListParams: object[] = [
  apiKeyHeader,
  queryParam("search", { type: "string" },             "Partial match on recordId or bullJobId"),
  queryParam("status", enumOf([...QueueJobStatuses]),  "Filter by BullMQ job status"),
  queryParam("type",   enumOf(queueJobTypeValues),     "Filter by job type"),
  ...paginationParams,
  ...sortParams,
];

// ── Paths ──────────────────────────────────────────────────────────────────
export const queuePaths: Record<string, object> = {

  "/queue": {
    ...post({
      summary    : "Create a queue job",
      description:
        "Creates a new job and adds it to the BullMQ queue. " +
        "Returns `bullJobId` — pass this to management endpoints for tracking.",
      parameters : [apiKeyHeader],
      body       : jsonBody({
        required: ["type"],
        props   : {
          type    : enumOf(queueJobTypeValues, { example: queueJobTypeValues[0] }),
          payload : { type: "object", additionalProperties: true, default: {}, description: "Feature-specific JSON data" },
          priority: { type: "integer", minimum: 1, maximum: 100, description: "Lower = higher priority" },
          delay   : { type: "integer", minimum: 0, description: "Delay before processing (ms)" },
          note    : str({ max: 500, example: "Triggered by user action." }),
        },
      }),
      responses: {
        ...created("Queue job created.", queueJobSchema),
        ...errors(400, 401, 403),
      },
    }),

    ...get({
      summary    : "List queue jobs",
      description: [
        "Returns a paginated list of BullMQ jobs.",
        "Supports search (by recordId or bullJobId), filter by status and type, sorting, and pagination.",
        "Data is read live from BullMQ (Redis) — not from MongoDB.",
      ],
      parameters : queueListParams,
      responses  : {
        ...ok("Queue jobs fetched.", { type: "array", items: queueJobSchema }),
        ...errors(401, 403),
      },
    }),
  },

  "/queue/{jobId}": {
    ...get({
      summary    : "Get a queue job",
      description: "Returns a single job by its BullMQ job ID.",
      parameters : [apiKeyHeader, jobIdPath],
      responses  : {
        ...ok("Queue job fetched.", queueJobSchema),
        ...errors(401, 403, 404),
      },
    }),

    ...del({
      summary    : "Cancel / remove a queue job",
      description:
        "Removes the job from the BullMQ queue. " +
        "Cannot cancel a job that is currently active or already completed.",
      parameters : [apiKeyHeader, jobIdPath],
      responses  : {
        ...ok("Queue job cancelled."),
        ...errors(401, 403, 404, 409),
      },
    }),
  },
};
