/*
  OpenAPI 3.0 specification assembly.

  Each feature module owns its own `<module>.swagger.ts` file alongside its
  routes/controller/service. Add the import and spread it into `paths` below.

  Pattern for adding a new module:
    1. Create  src/App/<Feature>/<feature>.swagger.ts
    2. Import  import { featurePaths } from "@/App/<Feature>/<feature>.swagger"
    3. Spread  paths: { ...authPaths, ...featurePaths }
    4. Add tag { name: "<Feature>", description: "..." } to the tags array
*/

import config from "@/Config";
import { authPaths       } from "@/App/Auth/auth.swagger";
import { socialAuthPaths } from "@/App/Auth/social/social.swagger";
import { adminPaths      } from "@/App/Admin/admin.swagger";

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
        isActive      : { type: "boolean", example: true },
        googleId      : { type: "string",  nullable: true, example: null },
        profilePicture: { type: "string",  nullable: true, example: "https://cdn.example.com/avatars/file.webp" },
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
        success      : { type: "boolean", example: false },
        message      : { type: "string" },
        errorMessages: {
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
    description: [
      "REST API documentation.",
      "",
      "## Rate limits",
      "| Scope  | Window | Max requests |",
      "|--------|--------|--------------|",
      "| Global (all `/api/v1` routes) | 1 min | 300 |",
      "| Auth endpoints (login / register) | 15 min | 10 |",
      "| Email endpoints (forgot-password / resend-verification) | 1 hr | 5 |",
      "",
      "Exceeded limits return **429 Too Many Requests**.",
    ].join("\n"),
    contact    : { email: config.mail.admin_contact_email },
  },
  servers: [
    { url: "/api/v1", description: "API base path" },
  ],
  tags: [
    { name: "Auth",        description: "Authentication, session management, and user profile" },
    { name: "Social Auth", description: "OAuth 2.0 social login (Google). Browser-redirect flow — open in a tab, not via fetch." },
    { name: "Admin",       description: "Admin-only user management" },
    // Add a tag here for each new module
  ],
  components,
  paths: {
    ...authPaths,
    ...socialAuthPaths,
    ...adminPaths,
    // ...featurePaths,  ← spread new module paths here
  },
};
