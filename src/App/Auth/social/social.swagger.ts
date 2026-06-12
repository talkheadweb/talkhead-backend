/*
  OpenAPI path definitions for Social / OAuth login.

  Routes are mounted at /auth/social (see Routes/index.ts), so the full paths are:
    GET  /api/v1/auth/social/google
    GET  /api/v1/auth/social/google/callback   (handled by Google redirect — do not call directly)
    POST /api/v1/auth/social/claim             (frontend calls this to exchange code for session)

  Full flow:
    1. Frontend navigates browser to GET /auth/social/google?origin=<frontend-origin>
    2. Backend validates origin, embeds it in OAuth state, redirects to Google consent screen
    3. Google redirects to GET /auth/social/google/callback?code=...&state=<origin>
    4. Backend exchanges code with Google, creates a one-time code (UUID, 2-min TTL in Redis),
       and redirects the browser to <origin>/auth/callback?code=<uuid>
    5. Frontend (server-side route handler) calls POST /auth/social/claim { code }
    6. Backend validates code, deletes it (one-time use), returns httpOnly cookies
    7. Frontend forwards Set-Cookie headers to the browser — user is now authenticated
*/

import { jsonBody, str, withTag } from "@/Config/swagger/helpers";

const { get, post } = withTag("Social Auth");

export const socialAuthPaths: Record<string, object> = {

  "/auth/social/google": get({
    summary    : "Initiate Google OAuth login",
    description: [
      "Redirects the browser to Google's OAuth 2.0 consent screen.",
      "Open this URL in a browser tab — do NOT call it via fetch/XHR.",
      "Pass `?origin=<your-frontend-origin>` so the backend knows where to redirect after auth.",
      "The origin must be in the CORS_ALLOWED_ORIGINS whitelist.",
      "Example: GET /api/v1/auth/social/google?origin=https://app.example.com",
    ],
    parameters: [
      {
        name       : "origin",
        in         : "query",
        required   : false,
        schema     : { type: "string", example: "https://app.example.com" },
        description: "Your frontend origin (protocol + host, no path). Must be in CORS allowlist. Falls back to FRONTEND_SOCIAL_CALLBACK_URL env var if omitted.",
      },
    ],
    responses: {
      302: {
        description: "Redirect to Google consent screen",
        headers    : {
          Location: {
            schema     : { type: "string" },
            description: "Google OAuth 2.0 authorization URL",
          },
        },
      },
    },
  }),

  "/auth/social/google/callback": get({
    summary    : "Google OAuth callback (internal — do not call directly)",
    description: [
      "Google redirects the browser here after the user grants permission.",
      "Do NOT call this endpoint directly.",
      "On success: creates a one-time auth code (2-minute TTL) and redirects to <origin>/auth/callback?code=<uuid>.",
      "On failure: redirects to <origin>/auth/callback?error=<message>.",
      "The `origin` is recovered from the OAuth `state` parameter set in step 1.",
    ],
    parameters: [
      { name: "code",  in: "query", required: false, schema: { type: "string" }, description: "Authorization code from Google (set by Google automatically)" },
      { name: "state", in: "query", required: false, schema: { type: "string" }, description: "Frontend origin encoded as OAuth state (set by this backend in step 1)" },
      { name: "error", in: "query", required: false, schema: { type: "string" }, description: "Error code from Google if the user denied access" },
    ],
    responses: {
      302: {
        description: "Redirect to frontend callback page",
        headers    : {
          Location: {
            schema     : { type: "string" },
            description: "<origin>/auth/callback?code=<uuid>  or  <origin>/auth/callback?error=<message>",
          },
        },
      },
    },
  }),

  "/auth/social/claim": post({
    summary    : "Exchange one-time code for session cookies",
    description: [
      "Exchanges the short-lived one-time code (received in the frontend callback URL) for httpOnly session cookies.",
      "This call is made server-side by the frontend route handler — NOT from the browser directly.",
      "The code is single-use and expires after 2 minutes.",
      "On success: sets `access_token` and `refresh_token` httpOnly cookies, identical to a regular login.",
      "On failure (expired or already used): returns 401.",
    ],
    body: jsonBody({
      required: ["code"],
      props   : {
        code: str({ format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" }),
      },
    }),
    responses: {
      200: { description: "Session cookies set — access_token and refresh_token httpOnly cookies issued (same as regular login)" },
      400: { description: "Missing or invalid `code` field" },
      401: { description: "Code is expired (> 2 minutes) or has already been used" },
    },
  }),

};
