/*
  OpenAPI path definitions for the Auth module.

  Lives alongside the routes/controller/service it documents — when you add
  a new auth endpoint, update this file in the same commit.

  Uses the builder DSL from @/Config/swagger/helpers — read the legend at the
  top of that file once and the structure below becomes self-explanatory.
  Each endpoint reads top-to-bottom: summary → description → body → responses.
*/

import {
  binary,
  created,
  dualBody,
  email,
  errors,
  jsonBody,
  multipartBody,
  ok,
  ref,
  str,
  withTag,
} from "@/Config/swagger/helpers";

const { get, post, patch } = withTag("Auth");

// Reusable: the public user object returned by profile endpoints
const userData = ref("UserPublic");

export const authPaths: Record<string, object> = {

  // ── Public ────────────────────────────────────────────────────────────────

  "/auth/register": post({
    summary    : "Register a new account",
    description: "Creates a user account and sends a verification email. The account cannot log in until the email is verified. Rate limited per IP + email.",
    body       : jsonBody({
      required: ["name", "email", "password"],
      props   : {
        name    : str({ min: 2, max: 50, example: "John Doe" }),
        email   : email(),
        password: str({ min: 8, example: "secret123" }),
        // role is intentionally absent — always defaults to 'user' on registration
      },
    }),
    responses  : { ...created("Account created. Verification email sent."), ...errors(400, 409, 429) },
  }),

  "/auth/login": post({
    summary    : "Login",
    description: [
      "Authenticates the user and returns a short-lived access token.",
      "Sets two httpOnly cookies: `access_token` (15 min) and `refresh_token` (7 days).",
      "Web clients rely on the cookies — browser sends them automatically on every request.",
      "Mobile / API clients should use the `accessToken` field from the response body as a Bearer token.",
      "If the email is not verified, a fresh verification link is automatically emailed and a 403 is returned.",
      "Rate limited per IP to prevent brute-force.",
    ],
    body       : jsonBody({
      required: ["email", "password"],
      props   : { email: email(), password: str({ example: "secret123" }) },
    }),
    responses  : {
      ...ok("Login successful.", {
        type      : "object",
        properties: { accessToken: str(), user: userData },
      }),
      ...errors(400, 401, 403, 429),
    },
  }),

  "/auth/logout": post({
    summary   : "Logout",
    description: "Revokes the refresh token from Redis and clears both `access_token` and `refresh_token` cookies. Always succeeds, even with no cookie.",
    responses : { ...ok("Logged out successfully.") },
  }),

  "/auth/refresh-token": post({
    summary   : "Refresh access token",
    description: "Uses the `refresh_token` httpOnly cookie to issue a new access token. Also sets a new `access_token` cookie. Intended for mobile clients — web clients get silent refresh automatically via the `authenticate` middleware. Fails if the token is expired, invalid, or revoked via logout.",
    responses : {
      ...ok("Token refreshed.", { type: "object", properties: { accessToken: str() } }),
      ...errors(401),
    },
  }),

  "/auth/forgot-password": post({
    summary   : "Request password reset",
    description: "Sends a password reset link if an account exists. Always returns 200 to prevent email enumeration. Rate limited per IP + email.",
    body      : jsonBody({ required: ["email"], props: { email: email() } }),
    responses : { ...ok("Reset link sent (if account exists)."), ...errors(400, 429) },
  }),

  "/auth/reset-password": post({
    summary   : "Reset password",
    description: "Resets the password using the token from the reset email link. Token expires after 1 hour.",
    body      : jsonBody({
      required: ["userId", "token", "password"],
      props   : {
        userId  : str({ example: "6700000000000000000000ab" }),
        token   : str({ example: "uuid-reset-token" }),
        password: str({ min: 8, example: "newSecret123" }),
      },
    }),
    responses : { ...ok("Password reset successfully."), ...errors(400) },
  }),

  "/auth/verify-email": post({
    summary   : "Verify email address",
    description: "Marks the account verified using the token from the verification email. Token expires after 24 hours. A fresh token is auto-sent when an unverified user attempts to log in.",
    body      : jsonBody({
      required: ["userId", "token"],
      props   : {
        userId: str({ example: "6700000000000000000000ab" }),
        token : str({ example: "uuid-verify-token" }),
      },
    }),
    responses : { ...ok("Email verified successfully."), ...errors(400) },
  }),

  "/auth/resend-verification": post({
    summary   : "Resend verification email",
    description: "Generates a new 24-hour verification token and resends the email. Always returns 200 to prevent email enumeration. Rate limited per IP + email.",
    body      : jsonBody({ required: ["email"], props: { email: email() } }),
    responses : { ...ok("Verification email sent (if account exists and is unverified)."), ...errors(400, 429) },
  }),

  // ── Protected (require valid Bearer access token) ─────────────────────────

  "/auth/me": get({
    summary   : "Get current user profile",
    description: "Returns the authenticated user's profile. Requires a valid Bearer access token.",
    secured   : true,
    responses : { ...ok("Profile fetched.", userData), ...errors(401, 404) },
  }),

  "/auth/profile": patch({
    summary   : "Update profile",
    description: [
      "Updates the authenticated user's profile. Send JSON for a name-only update,",
      "or multipart/form-data to also upload a new profile picture.",
      "At least one of name / profilePicture must be provided.",
      "The old profile picture is automatically deleted from R2 when a new one is uploaded.",
    ],
    secured   : true,
    body      : dualBody(
      jsonBody({ props: { name: str({ min: 2, max: 50, example: "New Name" }) } }),
      multipartBody({
        props: {
          name          : str({ min: 2, max: 50 }),
          profilePicture: binary({ description: "JPEG / PNG / WebP, max 2 MB" }),
        },
      }),
    ),
    responses : { ...ok("Profile updated.", userData), ...errors(400, 401, 404) },
  }),

  "/auth/change-password": patch({
    summary   : "Change password",
    description: "Changes the password, invalidates all active sessions (forces re-login on every device), and clears the current session cookie.",
    secured   : true,
    body      : jsonBody({
      required: ["currentPassword", "newPassword"],
      props   : {
        currentPassword: str({ example: "oldSecret123" }),
        newPassword    : str({ min: 8, example: "newSecret456" }),
      },
    }),
    responses : { ...ok("Password changed. Please log in again."), ...errors(400, 401, 404) },
  }),

};
