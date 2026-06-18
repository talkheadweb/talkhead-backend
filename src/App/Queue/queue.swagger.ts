/*
  OpenAPI path definitions for the Queue module.

  All endpoints are protected by x-api-key header.
  Source of truth for job data is MongoDB (QueueJob collection) — not Redis.
*/

import {
  created,
  dateRangeParams,
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
import { QueueJobType, QueueJobStatusValues } from "@/Config/queue/const";

const { post, get, del } = withTag("Queue");

const queueJobTypeValues  = Object.values(QueueJobType);
const queueJobStatusValues = [...QueueJobStatusValues];

const apiKeyHeader = {
  in: "header", name: "x-api-key", required: true,
  schema: { type: "string" },
  description: "API key for queue management endpoints",
};

const jobIdPath = {
  in: "path", name: "id", required: true,
  schema: { type: "string" },
  description: "MongoDB _id of the QueueJob document",
};

const queueJobSchema = {
  type      : "object",
  properties: {
    _id         : str({ example: "664f1b2c3e4a5b6c7d8e9f02" }),
    recordId    : str({ example: "QJ-a1b2c3d4" }),
    type        : enumOf(queueJobTypeValues, { example: queueJobTypeValues[0] }),
    status      : enumOf(queueJobStatusValues),
    payload     : { type: "object", additionalProperties: true },
    bullJobId   : str({ example: "664f1b2c3e4a5b6c7d8e9f00" }),
    attempts    : { type: "integer", example: 0 },
    startedAt   : { type: "string", format: "date-time", nullable: true },
    finishedAt  : { type: "string", format: "date-time", nullable: true },
    failedReason: { type: "string", nullable: true },
    createdAt   : { type: "string", format: "date-time" },
    updatedAt   : { type: "string", format: "date-time" },
  },
};

const queueListParams: object[] = [
  apiKeyHeader,
  queryParam("search", { type: "string" },             "Partial match on recordId or bullJobId"),
  queryParam("status", enumOf(queueJobStatusValues),   "Filter by job status"),
  queryParam("type",   enumOf(queueJobTypeValues),     "Filter by job type"),
  ...paginationParams,
  ...sortParams,
  ...dateRangeParams,
];

export const queuePaths: Record<string, object> = {

  "/queue": {
    ...post({
      summary    : "Create a queue job",
      description: "Creates a new job in MongoDB and adds it to BullMQ. Returns the persisted QueueJob document.",
      parameters : [apiKeyHeader],
      body       : jsonBody({
        required: ["type"],
        props   : {
          type    : enumOf(queueJobTypeValues, { example: queueJobTypeValues[0] }),
          payload : { type: "object", additionalProperties: true, default: {}, description: "Feature-specific data" },
          priority: { type: "integer", minimum: 1, maximum: 100, description: "Lower = higher priority" },
          delay   : { type: "integer", minimum: 0, description: "Delay before processing (ms)" },
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
        "Returns a paginated list of QueueJob documents from MongoDB.",
        "Supports full-text search on recordId/bullJobId, discrete filters on status/type, sort, and pagination.",
        "MongoDB is the source of truth — full history, not limited to Redis TTL.",
      ],
      parameters : queueListParams,
      responses  : {
        ...ok("Queue jobs fetched.", { type: "array", items: queueJobSchema }),
        ...errors(401, 403),
      },
    }),
  },

  "/queue/{id}": {
    ...get({
      summary    : "Get a queue job",
      description: "Returns a single QueueJob document by its MongoDB _id.",
      parameters : [apiKeyHeader, jobIdPath],
      responses  : {
        ...ok("Queue job fetched.", queueJobSchema),
        ...errors(401, 403, 404),
      },
    }),

    ...del({
      summary    : "Cancel a queue job",
      description: "Cancels a pending job — removes it from BullMQ and marks it cancelled in MongoDB. Returns 409 if already processing, completed, or cancelled.",
      parameters : [apiKeyHeader, jobIdPath],
      responses  : {
        ...ok("Queue job cancelled.", queueJobSchema),
        ...errors(401, 403, 404, 409),
      },
    }),
  },
};
