import {
  bool,
  created,
  enumOf,
  errors,
  jsonBody,
  ok,
  ref,
  str,
  withTag,
} from "@/Config/swagger/helpers";

const { get, post, patch, del } = withTag("Admin");

const userId = {
  name    : "id",
  in      : "path",
  required: true,
  schema  : { type: "string", example: "6700000000000000000000ab" },
  description: "MongoDB ObjectId of the target user",
};

// Reusable paginated user list response
const userListResponse = {
  200: {
    description: "Paginated user list",
    content    : {
      "application/json": {
        schema: {
          type      : "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string",  example: "Users fetched successfully." },
            data   : { type: "array", items: { $ref: "#/components/schemas/UserPublic" } },
            meta   : {
              type      : "object",
              properties: {
                page      : { type: "integer", example: 1 },
                limit     : { type: "integer", example: 10 },
                total     : { type: "integer", example: 42 },
                totalPages: { type: "integer", example: 5 },
              },
            },
          },
        },
      },
    },
  },
};

export const adminPaths = {

  "/admin/users": {

    ...get({
      summary    : "List all users",
      description: [
        "Returns a paginated, searchable, filterable list of all users.",
        "All active filters are combined with `$and`.",
        "**Search** (`?search=`) matches `name` and `email` with a case-insensitive regex;",
        "if the value is also a valid MongoDB ObjectId, an `_id` exact-match is added.",
        "**Filter** values are type-coerced from the Mongoose schema automatically",
        "(String → regex, Boolean → strict true/false).",
      ],
      secured    : true,
      parameters : [
        { name: "page",       in: "query", schema: { type: "integer", default: 1 },                                          description: "Page number (1-based)" },
        { name: "limit",      in: "query", schema: { type: "integer", default: 10 },                                         description: "Items per page" },
        { name: "sortBy",     in: "query", schema: { type: "string",  default: "createdAt" },                                description: "Field to sort by" },
        { name: "sortOrder",  in: "query", schema: { type: "string",  enum: ["asc", "desc"], default: "desc" },              description: "Sort direction" },
        { name: "search",     in: "query", schema: { type: "string" },                                                       description: "Regex search on name + email; exact _id match if value is a valid ObjectId" },
        { name: "role",       in: "query", schema: { type: "string",  enum: ["user", "admin"] },                             description: "Filter by role" },
        { name: "isVerified", in: "query", schema: { type: "string",  enum: ["true", "false"] },                             description: "Filter by email verification status" },
        { name: "isActive",   in: "query", schema: { type: "string",  enum: ["true", "false"] },                             description: "Filter by active (true) or suspended (false) status" },
      ],
      responses: { ...userListResponse, ...errors(401, 403) },
    }),

    ...post({
      summary    : "Create a user",
      description: "Admin creates a new user account. The account is auto-verified. Role can be set directly.",
      secured    : true,
      body       : jsonBody({
        required: ["name", "email", "password"],
        props   : {
          name    : str({ min: 2, max: 50, example: "Jane Smith" }),
          email   : { type: "string", format: "email", example: "jane@example.com" },
          password: str({ min: 8, max: 128, example: "SecurePass123" }),
          role    : enumOf(["user", "admin"], { default: "user" }),
        },
      }),
      responses: { ...created("User created successfully.", ref("UserPublic")), ...errors(400, 401, 403, 409) },
    }),
  },

  "/admin/users/{id}": {

    ...get({
      summary    : "Get a user",
      description: "Returns the full profile of a single user by ID.",
      secured    : true,
      parameters : [userId],
      responses  : { ...ok("User fetched successfully.", ref("UserPublic")), ...errors(401, 403, 404) },
    }),

    ...patch({
      summary    : "Update a user",
      description: "Update profile fields, role, verification status, or active status. Suspending a user (isActive=false) immediately revokes their session.",
      secured    : true,
      parameters : [userId],
      body       : jsonBody({
        props: {
          name      : str({ min: 2, max: 50, example: "Jane Smith" }),
          email     : { type: "string", format: "email", example: "jane@example.com" },
          role      : enumOf(["user", "admin"]),
          isVerified: bool({ example: true }),
          isActive  : bool({ example: false }),
        },
      }),
      responses: { ...ok("User updated successfully.", ref("UserPublic")), ...errors(400, 401, 403, 404, 409) },
    }),

    ...del({
      summary    : "Delete a user",
      description: "Permanently deletes the user and revokes all their active tokens.",
      secured    : true,
      parameters : [userId],
      responses  : { ...ok("User deleted successfully."), ...errors(401, 403, 404) },
    }),
  },

  "/admin/users/{id}/password": {

    ...patch({
      summary    : "Change a user's password",
      description: "Admin resets any user's password without requiring the current password. The user's active session is revoked.",
      secured    : true,
      parameters : [userId],
      body       : jsonBody({
        required: ["password"],
        props   : { password: str({ min: 8, max: 128, example: "NewSecurePass456" }) },
      }),
      responses: { ...ok("User password changed successfully."), ...errors(400, 401, 403, 404) },
    }),
  },
};
