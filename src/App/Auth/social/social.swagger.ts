/*
  OpenAPI path definitions for Social / OAuth login.

  Routes are mounted at /auth/social (see Routes/index.ts), so the full paths are:
    GET /api/v1/auth/social/google
    GET /api/v1/auth/social/google/callback

  Note: these are browser-redirect flows — the client navigates to the URL in
  a normal browser tab, NOT via fetch/XHR. That is why the response is a 302
  redirect rather than JSON.

  Token delivery:
    - access token  → appended to the redirect URL as ?token=<jwt>
    - refresh token → set as an httpOnly cookie (`refresh_token`)
  The frontend reads the access token from the query string, stores it, and
  then uses it identically to a normal login access token.
*/

import { withTag } from "@/Config/swagger/helpers";

const { get } = withTag("Social Auth");

export const socialAuthPaths: Record<string, object> = {

  "/auth/social/google": get({
    summary    : "Initiate Google OAuth login",
    description: [
      "Redirects the browser to Google's OAuth 2.0 consent screen.",
      "Open this URL in a browser tab — do NOT call it via fetch/XHR.",
      "After the user grants permission, Google redirects back to /auth/social/google/callback.",
    ],
    responses  : {
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
    summary    : "Google OAuth callback",
    description: [
      "Handled automatically by Google after the user grants permission.",
      "Do NOT call this endpoint directly.",
      "On success: redirects to FRONTEND_SOCIAL_CALLBACK_URL?token=<accessToken>.",
      "A `refresh_token` httpOnly cookie is also set (same behaviour as normal login).",
      "The frontend reads the access token from the query string and stores it.",
      "On failure (access denied or error): redirects to FRONTEND_SOCIAL_CALLBACK_URL?error=oauth_failed.",
    ],
    parameters: [
      { name: "code",  in: "query", required: false, schema: { type: "string" }, description: "Authorization code from Google (set by Google automatically)" },
      { name: "state", in: "query", required: false, schema: { type: "string" }, description: "CSRF state parameter (set by Google automatically)" },
    ],
    responses: {
      302: {
        description: "Redirect to frontend with access token or error flag",
        headers    : {
          Location: {
            schema     : { type: "string" },
            description: "FRONTEND_SOCIAL_CALLBACK_URL?token=<jwt>  or  ?error=oauth_failed",
          },
          "Set-Cookie": {
            schema     : { type: "string" },
            description: "refresh_token=<jwt>; HttpOnly; SameSite=Strict (on success only)",
          },
        },
      },
    },
  }),

};
