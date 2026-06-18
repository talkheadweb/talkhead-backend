import { z } from "zod";

const slugField = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens");

export const createAvatarSchema = z.object({
  body: z.object({
    title   : z.string().min(1).max(100),
    slug    : slugField.optional(),
    isSystem: z.boolean().optional(),
  }),
});

export const updateAvatarSchema = z.object({
  body: z.object({
    title   : z.string().min(1).max(100).optional(),
    slug    : slugField.optional(),
    isActive: z.boolean().optional(),
    isSystem: z.boolean().optional(),
  }).refine(
    (d) => Object.keys(d).some((k) => d[k as keyof typeof d] !== undefined),
    { message: "At least one field is required" },
  ),
});
