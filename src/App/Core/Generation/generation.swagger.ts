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
import { GenerationInputTypeValues, GenerationStatusValues } from "./const";

const { post, get, patch, del } = withTag("Generation");

// ── Reusable schema fragments ──────────────────────────────────────────────
const generationObject = {
  type      : "object",
  properties: {
    _id           : str({ example: "664f1b2c3e4a5b6c7d8e9f00" }),
    userId        : str({ example: "664f1b2c3e4a5b6c7d8e9f01" }),
    status        : enumOf([...GenerationStatusValues]),
    inputType     : enumOf([...GenerationInputTypeValues]),
    voiceId       : str({ example: "af_heart" }),
    avatarImageKey: str({ example: "generations/images/uuid.jpg" }),
    avatarImageUrl: str({ example: "https://r2.example.com/generations/images/uuid.jpg?presigned=..." }),
    inputText     : str({ example: "Read this aloud in a calm voice." }),
    inputAudioKey : str({ example: "generations/audio/uuid.mp3" }),
    inputAudioUrl : str({ example: "https://r2.example.com/generations/audio/uuid.mp3?presigned=..." }),
    outputFileKey : str({ example: "generations/output/uuid.mp4" }),
    outputUrl     : str({ example: "https://r2.example.com/generations/output/uuid.mp4?presigned=..." }),
    errorMessage  : str({ example: "Processing failed due to timeout." }),
    completedAt   : { type: "string", format: "date-time" },
    createdAt     : { type: "string", format: "date-time" },
    updatedAt     : { type: "string", format: "date-time" },
  },
};

// ── Shared list query parameters ───────────────────────────────────────────
const generationListParams: object[] = [
  queryParam("status",    enumOf([...GenerationStatusValues]),    "Filter by job status"),
  queryParam("inputType", enumOf([...GenerationInputTypeValues]), "Filter by input type"),
  queryParam("userId",    { type: "string" },                     "Filter by user (admin only)"),
  ...paginationParams,
  ...sortParams,
];

// ── Paths ──────────────────────────────────────────────────────────────────
export const generationPaths = {
  "/generations": {
    ...post({
      summary    : "Create a generation job",
      description:
        "Accepts multipart/form-data. Either upload an avatarImage file or provide an avatarImageKey (R2 file key from the Avatar module). " +
        "When inputType is audio, inputAudio file (MP3/WAV/M4A ≤ 12 MB) is also required. " +
        "Files are uploaded to R2 after the job is enqueued; the record is rolled back if enqueue fails. " +
        "Pass ?mode=test to skip the external API and resolve the job instantly with a dummy output file (for integration testing).",
      secured    : true,
      parameters : [
        queryParam("mode", enumOf(["test"]), "Test mode — skips external API, resolves job with dummy output immediately"),
      ],
      body     : {
        required   : true,
        content    : {
          "multipart/form-data": {
            schema: {
              type      : "object",
              required  : ["inputType", "voiceId"],
              properties: {
                inputType      : enumOf([...GenerationInputTypeValues]),
                voiceId        : str({ example: "af_heart" }),
                inputText      : str({ max: 5000, example: "Read this calmly." }),
                avatarImageKey : { ...str({ example: "avatar-images/uuid.webp" }), description: "R2 file key from an existing Avatar record (alternative to avatarImage file upload)" },
                avatarImage    : { type: "string", format: "binary", description: "JPEG/PNG ≤ 5 MB (alternative to avatarImageKey)" },
                inputAudio     : { type: "string", format: "binary", description: "MP3/WAV/M4A ≤ 12 MB (required when inputType=audio)" },
              },
            },
          },
        },
      },
      responses: {
        ...created("Generation job created.", generationObject),
        ...errors(400, 401),
      },
    }),

    ...get({
      summary    : "List generation jobs",
      description:
        "Authenticated users see only their own records. Admins see all. " +
        "Supports discrete filters, sorting, and pagination.",
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
      description: "Admin patch for status, outputFileKey, errorMessage, or completedAt.",
      secured    : true,
      body       : jsonBody({
        required: [],
        props   : {
          status       : enumOf([...GenerationStatusValues]),
          outputFileKey: str({ example: "generations/output/uuid.mp4" }),
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
        "Removes the job from BullMQ and sets status to cancelled. " +
        "Only works while the job is still pending. Owner or admin can cancel.",
      secured  : true,
      responses: {
        ...ok("Generation cancelled.", generationObject),
        ...errors(401, 403, 404, 409),
      },
    }),
  },

  "/generations/{id}/callback": {
    ...post({
      summary    : "External API callback — mark generation complete or failed",
      description:
        "Called by the external API when processing finishes. " +
        "Secured by x-api-key header (not a user JWT). " +
        "success=true: provide outputFileKey (the R2 object key returned by /files/external-upload). " +
        "success=false: include message with the failure reason. " +
        "See docs/architecture/external-api-contract.md for the full integration spec.",
      secured  : false,
      body     : jsonBody({
        required: ["success"],
        props   : {
          success      : { type: "boolean", example: true },
          outputFileKey: str({ example: "generations/output/550e8400-e29b-41d4-a716-446655440000.mp4" }),
          message      : str({ example: "GPU out of memory" }),
        },
      }),
      responses: {
        ...ok("Callback processed.", {}),
        ...errors(400, 401, 403, 404),
      },
    }),
  },
};
