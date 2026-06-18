import { z } from "zod";
import { FileTypeValues } from "./const";
import { isValidMongoID } from "@/Utils/validation/mongoose.validation";

export const uploadFileSchema = z.object({
  body: z.object({
    type   : z.enum(FileTypeValues, { required_error: "type is required" }),
    ownerId: z.string().optional(),
  }),
});

export const externalUploadSchema = z.object({
  body: z.object({
    generationId: z.string().refine(isValidMongoID, "generationId must be a valid MongoDB ID"),
    ownerId     : z.string().refine(isValidMongoID, "ownerId must be a valid MongoDB ID").optional(),
  }),
});

export const listFilesSchema = z.object({
  query: z.object({
    type     : z.string().optional(),
    ownerId  : z.string().optional(),
    page     : z.string().optional(),
    limit    : z.string().optional(),
    sortBy   : z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
});
