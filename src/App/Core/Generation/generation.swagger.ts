/*
  OpenAPI path definitions for the Generation module.

  Uses the builder DSL from @/Config/swagger/helpers.
  Every endpoint is tagged "Generation".
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
import {
  GenerationInputTypeValues,
  GenerationOutputTypeValues,
  GenerationStatusValues,
} from "./const";

const { post, get, patch, del } = withTag("Generation");

// ── Reusable schema fragments ──────────────────────────────────────────────
const generationObject = {
  type      : "object",
  properties: {
    _id             : str({ example: "664f1b2c3e4a5b6c7d8e9f00" }),
    userId          : str({ example: "664f1b2c3e4a5b6c7d8e9f01" }),
    bullJobId       : str({ example: "42" }),
    status          : enumOf([...GenerationStatusValues]),
    inputType       : enumOf([...GenerationInputTypeValues]),
    outputType      : enumOf([...GenerationOutputTypeValues]),
    inputText       : str({ example: "Generate a calming audio clip about nature." }),
    referenceImageUrl: str({ example: "https://cdn.example.com/ref.jpg" }),
    audioUrl        : str({ example: "https://cdn.example.com/out.mp3" }),
    videoUrl        : str({ example: "https://cdn.example.com/out.mp4" }),
    ysid            : str({ example: "ys_abc123" }),
    errorMessage    : str({ example: "Processing failed due to timeout." }),
    completedAt     : { type: "string", format: "date-time" },
    createdAt       : { type: "string", format: "date-time" },
    updatedAt       : { type: "string", format: "date-time" },
  },
};

// ── Shared list query parameters ───────────────────────────────────────────
const generationListParams: object[] = [
  // Search
  queryParam("search", { type: "string" }, "Search by ysid or MongoDB _id"),

  // Filters
  queryParam("status",     enumOf([...GenerationStatusValues]),    "Filter by job status"),
  queryParam("inputType",  enumOf([...GenerationInputTypeValues]), "Filter by input type"),
  queryParam("outputType", enumOf([...GenerationOutputTypeValues]),"Filter by output type"),

  // Pagination + sort
  ...paginationParams,
  ...sortParams,
];

// ── Paths ──────────────────────────────────────────────────────────────────
export const generationPaths = {
  "/generations": {
    ...post({
      summary    : "Create a generation job",
      description:
        "Creates a new generation record (status: pending) and immediately enqueues it in BullMQ. " +
        "Returns the record including the BullMQ job ID for tracking.",
      secured  : true,
      body     : jsonBody({
        required: ["inputType", "outputType"],
        props   : {
          inputType        : enumOf([...GenerationInputTypeValues]),
          outputType       : enumOf([...GenerationOutputTypeValues]),
          inputText        : str({ max: 5000, example: "Describe the scene in calm tones." }),
          referenceImageUrl: str({ example: "https://cdn.example.com/ref.jpg" }),
        },
      }),
      responses: {
        ...created("Generation job created.", generationObject),
        ...errors(400, 401),
      },
    }),

    ...get({
      summary    : "List generation jobs",
      description: [
        "Returns a paginated list of generation records.",
        "Authenticated users see only their own records. Admins see all records.",
        "Supports full-text search by ysid, discrete filters, sorting, and pagination.",
        "Admins may additionally filter by userId.",
      ],
      secured    : true,
      parameters : generationListParams,
      responses  : {
        ...ok("Generations fetched.", { type: "array", items: generationObject }),
        ...errors(401),
      },
    }),
  },

  "/generations/{id}": {
    ...get({
      summary    : "Get a single generation job",
      description: "Returns one generation record by ID. Owners see their own; admins see any.",
      secured    : true,
      responses  : {
        ...ok("Generation fetched.", generationObject),
        ...errors(401, 403, 404),
      },
    }),

    ...patch({
      summary    : "Update generation result (admin only)",
      description: "Allows an admin (or the worker callback) to patch status, result URLs, ysid, or error message.",
      secured    : true,
      body       : jsonBody({
        required: [],
        props   : {
          status      : enumOf([...GenerationStatusValues]),
          audioUrl    : str({ example: "https://cdn.example.com/out.mp3" }),
          videoUrl    : str({ example: "https://cdn.example.com/out.mp4" }),
          ysid        : str({ example: "ys_abc123" }),
          errorMessage: str({ example: "Timeout error." }),
          completedAt : { type: "string", format: "date-time" },
        },
      }),
      responses: {
        ...ok("Generation updated.", generationObject),
        ...errors(400, 401, 403, 404),
      },
    }),

    ...del({
      summary    : "Delete a generation record (admin only)",
      description: "Hard-deletes the generation record from the database.",
      secured    : true,
      responses  : {
        ...ok("Generation deleted.", generationObject),
        ...errors(401, 403, 404),
      },
    }),
  },

  "/generations/{id}/cancel": {
    ...patch({
      summary    : "Cancel a pending generation job",
      description:
        "Removes the job from the BullMQ queue and sets status to cancelled. " +
        "Only works while the job is still pending. Owner or admin can cancel.",
      secured  : true,
      responses: {
        ...ok("Generation cancelled.", generationObject),
        ...errors(401, 403, 404, 409),
      },
    }),
  },
};
