# Admin Module

## Overview

The Admin module exposes a set of privileged endpoints that allow administrator accounts to manage all users in the system. Every route requires a valid JWT **and** the `admin` role — enforced at the router level via `authenticate` + `AccessLimit(["admin"])`.

Base path: `GET|POST|PATCH|DELETE /api/v1/admin/users`

---

## Endpoints

| Method   | Path                          | Description                     |
|----------|-------------------------------|---------------------------------|
| `GET`    | `/admin/users`                | Paginated, filterable user list |
| `POST`   | `/admin/users`                | Create a new user               |
| `GET`    | `/admin/users/:id`            | Get a single user by ID         |
| `PATCH`  | `/admin/users/:id`            | Update user fields              |
| `PATCH`  | `/admin/users/:id/password`   | Force-set a user's password     |
| `DELETE` | `/admin/users/:id`            | Delete a user                   |

---

## Authentication & Authorization

All endpoints require:

```
Authorization: Bearer <access_token>
```

The token must belong to a user with `role: "admin"`. Any other role receives **403 Forbidden**.

---

## Endpoint Details

### `GET /admin/users` — List Users

Returns a paginated, searchable, filterable list of users.

Follows the project-standard [query/filter pattern](../patterns/query-filter.md).

**Query parameters**

| Param        | Type              | Default      | Description |
|--------------|-------------------|--------------|-------------|
| `page`       | integer           | `1`          | Page number |
| `limit`      | integer           | `10`         | Items per page |
| `sortBy`     | string            | `createdAt`  | Any user field |
| `sortOrder`  | `asc` / `desc`    | `desc`       | Sort direction |
| `search`     | string            | —            | Regex search on `name`, `email`; exact `_id` match if value is a valid ObjectId |
| `role`       | `user` / `admin`  | —            | Filter by role (String — case-insensitive regex) |
| `isVerified` | `true` / `false`  | —            | Filter by email verification status |
| `isActive`   | `true` / `false`  | —            | Filter by active/suspended status |

**Search behaviour:** `?search=alice` matches any user whose `name` or `email` contains "alice" (case-insensitive). If the value is also a valid MongoDB ObjectId, an `_id` exact-match is added to the `$or`.

**Filter behaviour:** filters are combined with `$and`. Each filter key's type is read from the Mongoose schema at runtime — `String` → regex, `Boolean` → strict `true`/`false`, etc.

**Response 200**

```json
{
  "success": true,
  "message": "Users fetched successfully.",
  "data": [ { ...userPublic } ],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

---

### `POST /admin/users` — Create User

Creates a new user account. The account is marked `isVerified: true` immediately (no email verification needed for admin-created accounts).

**Request body**

```json
{
  "name":     "Jane Doe",
  "email":    "jane@example.com",
  "password": "SecurePass1",
  "role":     "user"            // optional, defaults to "user"
}
```

| Field      | Required | Rules                        |
|------------|----------|------------------------------|
| `name`     | ✓        | Non-empty string             |
| `email`    | ✓        | Valid email                  |
| `password` | ✓        | 8–128 characters             |
| `role`     |          | `"user"` or `"admin"`        |

**Response 201** — returns the created user (without password).

**Errors**
- `400` — Validation failure
- `409` — Email already registered

---

### `GET /admin/users/:id` — Get User

Returns a single user document by MongoDB ObjectId.

**Path parameter:** `id` — valid MongoDB ObjectId

**Response 200** — returns the user object.

**Errors**
- `400` — Invalid ObjectId format
- `404` — User not found

---

### `PATCH /admin/users/:id` — Update User

Partially updates a user's profile. At least one field is required. To suspend an account, set `isActive: false` — this immediately revokes the user's active session (refresh token deleted from Redis).

**Request body** (all optional, at least one required)

```json
{
  "name":       "Updated Name",
  "email":      "newemail@example.com",
  "role":       "admin",
  "isVerified": true,
  "isActive":   false
}
```

**Response 200** — returns the updated user.

**Errors**
- `400` — Empty body or invalid ObjectId
- `404` — User not found
- `409` — New email already in use by another account

> **Security note:** Setting `isActive: false` immediately invalidates the target user's session — they will be unable to use their refresh token to obtain new access tokens.

---

### `PATCH /admin/users/:id/password` — Change User Password

Force-sets a new password for any user. The user's session is revoked after the password change, requiring them to log in again.

**Request body**

```json
{ "password": "NewSecurePass1" }
```

| Field      | Rules            |
|------------|------------------|
| `password` | 8–128 characters |

**Response 200**

```json
{ "success": true, "message": "Password changed successfully", "data": null }
```

**Errors**
- `400` — Password too short / invalid ObjectId
- `404` — User not found

---

### `DELETE /admin/users/:id` — Delete User

Permanently removes a user account and revokes their active session.

**Response 200**

```json
{ "success": true, "message": "User deleted successfully", "data": null }
```

**Errors**
- `400` — Invalid ObjectId
- `404` — User not found

---

## File Structure

```
src/App/Admin/
  types.ts          # AdminUserSearchKeys, AdminUserFilterKeys, TListUsersPayload, body DTOs
  validation.ts     # Zod schemas for all endpoints
  service.ts        # AdminService — business logic + query/filter loop
  controller.ts     # Request/response handlers
  routes.ts         # adminRouter (auth guard applied at router level)
  admin.swagger.ts  # OpenAPI path definitions

__tests__/Admin/
  _helpers.ts                  # Shared tokens, mockUserDoc, VALID_ID, INVALID_ID
  list-users.test.ts           # 4 cases (mock preserves real schema for filter loop)
  get-user.test.ts             # 5 cases
  create-user.test.ts          # 7 cases
  update-user.test.ts          # 8 cases
  change-user-password.test.ts # 6 cases
  delete-user.test.ts          # 5 cases
```

---

## Business Rules

1. **Self-protection** — No restriction implemented at model level; if needed, add a check in `updateUser`/`deleteUser` to prevent admins from deleting themselves.
2. **Social login users** — Admin-created users always have a password. Social-only users (no `password` field) can still have their password set via the force-change endpoint.
3. **Session revocation** — Any operation that invalidates a user's trust (suspension, password change, deletion) calls `AuthRedisService.refreshToken.del(userId)`, immediately ending the user's session.
4. **Verified by default** — Users created via the admin API are pre-verified (`isVerified: true`), bypassing the email verification flow.
5. **Role assignment** — Admins may assign any role including `admin`, unlike the self-registration endpoint which strips the role field.

---

## Swagger Docs

Available at `/api/docs` in development. All 6 endpoints are documented under the **Admin** tag with full request/response schemas.
