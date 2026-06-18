import { EUserRole } from "@/App/Auth/types";
import { isValidMongoID } from "@/Utils/validation/mongoose.validation";
import { z } from "zod";

const userIdParam = z.object({
  params: z.object({
    id: z.string().refine(isValidMongoID, { message: "Invalid user ID." }),
  }),
});

const createUserSchema = userIdParam.omit({ params: true }).extend({
  body: z.object({
    name    : z.string().trim().min(2, "Name must be at least 2 characters.").max(50, "Name must be at most 50 characters."),
    email   : z.string().trim().toLowerCase().email("Please provide a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters.").max(128, "Password must be at most 128 characters."),
    role    : z.nativeEnum(EUserRole).optional().default(EUserRole.USER),
  }),
});

const updateUserSchema = userIdParam.extend({
  body: z.object({
    name      : z.string().trim().min(2).max(50).optional(),
    email     : z.string().trim().toLowerCase().email().optional(),
    role      : z.nativeEnum(EUserRole).optional(),
    isVerified: z.boolean().optional(),
    isActive  : z.boolean().optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: "At least one field is required.",
  }),
});

const changeUserPasswordSchema = userIdParam.extend({
  body: z.object({
    password: z.string().min(8, "Password must be at least 8 characters.").max(128, "Password must be at most 128 characters."),
  }),
});

const changeUserRoleSchema = userIdParam.extend({
  body: z.object({
    role: z.nativeEnum(EUserRole, { required_error: "Role is required.", invalid_type_error: "Invalid role value." }),
  }),
});

const getUserSchema = userIdParam;

export const AdminValidation = {
  createUserSchema,
  updateUserSchema,
  changeUserPasswordSchema,
  changeUserRoleSchema,
  getUserSchema,
};
