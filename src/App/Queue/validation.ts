import { z } from "zod";
import { QueueJobType } from "@/Config/queue/const";

// Derive a typed tuple from the const object so z.enum stays in sync automatically
const queueJobTypeValues = Object.values(QueueJobType) as [string, ...string[]];

export const createQueueJobSchema = z.object({
  body: z.object({
    type    : z.enum(queueJobTypeValues, {
      required_error   : "type is required",
      invalid_type_error: `type must be one of: ${queueJobTypeValues.join(", ")}`,
    }),
    payload : z.record(z.unknown()).default({}),
    priority: z.number().int().min(1).max(100).optional(),
    delay   : z.number().int().min(0).optional(),
    note    : z.string().max(500).optional(),
  }),
});
