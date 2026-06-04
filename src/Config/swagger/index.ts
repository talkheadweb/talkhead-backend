import config from "@/Config";
import { authPaths } from "./paths/auth";

// ── Reusable schema components ─────────────────────────────────────────────
const components = {
  securitySchemes: {
    BearerAuth: {
      type       : "http",
      scheme     : "bearer",
      bearerFormat: "JWT",
      description: "Access token obtained from POST /auth/login",
    },
  },
  schemas: {
    UserPublic: {
      type      : "object",
      properties: {
        _id           : { type: "string", example: "6700000000000000000000ab" },
        name          : { type: "string", example: "John Doe" },
        email         : { type: "string", example: "john@example.com" },
        role          : { type: "string", enum: ["user", "admin"], example: "user" },
        isVerified    : { type: "boolean", example: true },
        profilePicture: { type: "string", nullable: true, example: "https://cdn.example.com/avatars/file.webp" },
        createdAt     : { type: "string", format: "date-time" },
        updatedAt     : { type: "string", format: "date-time" },
      },
    },
    SuccessResponse: {
      type      : "object",
      properties: {
        success: { type: "boolean", example: true },
        message: { type: "string" },
        data   : { type: "object" },
      },
    },
    ErrorResponse: {
      type      : "object",
      properties: {
        success       : { type: "boolean", example: false },
        message       : { type: "string" },
        errorMessages : {
          type : "array",
          items: {
            type      : "object",
            properties: {
              path   : { oneOf: [{ type: "string" }, { type: "number" }] },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
};

// ── Full OpenAPI 3.0 specification ─────────────────────────────────────────
export const swaggerSpec = {
  openapi: "3.0.0",
  info   : {
    title      : `${config.appName} API`,
    version    : "1.0.0",
    description: "REST API documentation for talkhead-backend",
    contact    : { email: config.mail.admin_contact_email },
  },
  servers: [
    { url: "/api/v1", description: "API base path" },
  ],
  tags: [
    { name: "Auth", description: "Authentication, session management, and user profile" },
  ],
  components,
  paths: authPaths,
};
