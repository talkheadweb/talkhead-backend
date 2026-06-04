import { z } from "zod";
import { isValidMongoID } from "@/Utils/validation/mongoose.validation";

const registerZodSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: "Name is required." })
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(50, "Name must be at most 50 characters."),
    email: z
      .string({ required_error: "Email is required." })
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address."),
    password: z
      .string({ required_error: "Password is required." })
      .min(8, "Password must be at least 8 characters."),
    // role is intentionally NOT accepted from clients — always USER on
    // self-registration. Admin accounts must be promoted by an existing admin.
  }),
});

const loginZodSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: "Email is required." })
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address."),
    password: z.string({ required_error: "Password is required." }).min(1),
  }),
});

const forgotPasswordZodSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: "Email is required." })
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address."),
  }),
});

const resetPasswordZodSchema = z.object({
  body: z.object({
    userId: z
      .string({ required_error: "User ID is required." })
      .refine(isValidMongoID, { message: "Invalid user ID." }),
    token   : z.string({ required_error: "Reset token is required." }),
    password: z
      .string({ required_error: "Password is required." })
      .min(8, "Password must be at least 8 characters."),
  }),
});

const verifyEmailZodSchema = z.object({
  body: z.object({
    userId: z
      .string({ required_error: "User ID is required." })
      .refine(isValidMongoID, { message: "Invalid user ID." }),
    token: z.string({ required_error: "Verification token is required." }),
  }),
});

const resendVerificationZodSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: "Email is required." })
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address."),
  }),
});

const updateProfileZodSchema = z.object({
  body: z.object({
    // Text fields only — file presence is checked in the controller after multer runs
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(50, "Name must be at most 50 characters.")
      .optional(),
  }),
});

const changePasswordZodSchema = z.object({
  body: z.object({
    currentPassword: z.string({ required_error: "Current password is required." }).min(1),
    newPassword    : z
      .string({ required_error: "New password is required." })
      .min(8, "New password must be at least 8 characters."),
  }),
});

export const AuthValidation = {
  registerZodSchema,
  loginZodSchema,
  forgotPasswordZodSchema,
  resetPasswordZodSchema,
  verifyEmailZodSchema,
  resendVerificationZodSchema,
  updateProfileZodSchema,
  changePasswordZodSchema,
};
