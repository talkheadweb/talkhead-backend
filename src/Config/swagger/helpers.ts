/*
 ============================================================================
  HOW TO READ / WRITE THESE DOCS  —  legend
 ============================================================================

  Endpoints are described with small builder helpers so you never hand-write
  deep OpenAPI nesting. Learn this vocabulary once and every path file reads
  like plain English.

  ── PROPERTY builders (describe ONE field) ───────────────────────────────
    str({ min, max, example })     a string field (min/max = length)
    email({ example })             an email-format string
    enumOf(["user","admin"])       a fixed set of allowed values
    bool({ example })              a boolean
    binary()                       an uploaded file (multipart)
    ref("UserPublic")              reuse a shared schema from swagger/index.ts

  ── BODY builders (describe the request body) ────────────────────────────
    jsonBody({ required:[...], props:{...} })   application/json
    multipartBody({ props:{...} })              file uploads
    dualBody(jsonBody(...), multipartBody(...)) accept either content type

  ── RESPONSE builders (each returns a { statusCode: {...} } fragment) ─────
    ok("msg", data?)        200 success (optional `data` schema)
    created("msg", data?)   201 success
    errors(400, 401, 409)   attaches the standard error responses

  ── ROUTE builders (one per HTTP verb, pre-tagged per module) ────────────
    const { post, get, patch } = withTag("Auth")
    post({ summary, description, secured?, body?, responses })

  ── Putting it together — an endpoint reads as a sentence ────────────────

    "/auth/register": post({
      summary    : "Register a new account",
      description : "Creates a user and emails a verification link.",
      body        : jsonBody({
        required: ["email", "password"],
        props   : { email: email(), password: str({ min: 6 }) },
      }),
      responses   : { ...created("Account created."), ...errors(400, 409) },
    }),

 ============================================================================
*/

// ── Types ───────────────────────────────────────────────────────────────────
type Schema = Record<string, any>;
type Props  = Record<string, Schema>;

type StrOpts = { min?: number; max?: number; example?: string; default?: string; nullable?: boolean; format?: string };

// ── Property builders ─────────────────────────────────────────────────────
export const str = (o: StrOpts = {}): Schema => ({
  type: "string",
  ...(o.min      !== undefined ? { minLength: o.min } : {}),
  ...(o.max      !== undefined ? { maxLength: o.max } : {}),
  ...(o.format   !== undefined ? { format  : o.format } : {}),
  ...(o.example  !== undefined ? { example : o.example } : {}),
  ...(o.default  !== undefined ? { default : o.default } : {}),
  ...(o.nullable ? { nullable: true } : {}),
});

export const email = (o: { example?: string } = {}): Schema =>
  str({ format: "email", example: o.example ?? "john@example.com" });

export const bool = (o: { example?: boolean } = {}): Schema => ({
  type: "boolean",
  ...(o.example !== undefined ? { example: o.example } : {}),
});

export const enumOf = (values: string[], o: { default?: string; example?: string } = {}): Schema => ({
  type: "string",
  enum: values,
  ...(o.default !== undefined ? { default: o.default } : {}),
  ...(o.example !== undefined ? { example: o.example } : {}),
});

export const binary = (o: { description?: string } = {}): Schema => ({
  type  : "string",
  format: "binary",
  ...(o.description ? { description: o.description } : {}),
});

export const ref = (schemaName: string): Schema => ({ $ref: `#/components/schemas/${schemaName}` });

// ── Body builders ─────────────────────────────────────────────────────────
const objectSchema = (props: Props, required?: string[]): Schema => ({
  type      : "object",
  ...(required?.length ? { required } : {}),
  properties: props,
});

export const jsonBody = (o: { required?: string[]; props: Props }) => ({
  required: true,
  content : { "application/json": { schema: objectSchema(o.props, o.required) } },
});

export const multipartBody = (o: { required?: string[]; props: Props }) => ({
  required: true,
  content : { "multipart/form-data": { schema: objectSchema(o.props, o.required) } },
});

/** Accept EITHER content type on one endpoint (e.g. JSON name-update or multipart picture upload). */
export const dualBody = (
  json     : ReturnType<typeof jsonBody>,
  multipart: ReturnType<typeof multipartBody>,
) => ({
  content: { ...json.content, ...multipart.content },
});

// ── Response builders ─────────────────────────────────────────────────────
const success = (code: number, description: string, data?: Schema) => ({
  [code]: {
    description,
    content: {
      "application/json": {
        schema: {
          allOf: [ref("SuccessResponse"), data ? { properties: { data } } : {}],
        },
      },
    },
  },
});

export const ok      = (description: string, data?: Schema) => success(200, description, data);
export const created = (description: string, data?: Schema) => success(201, description, data);

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Validation error",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  429: "Too many requests (rate limit exceeded)",
};

/** Attach one or more standard error responses, e.g. errors(400, 401, 429). */
export const errors = (...codes: number[]): Record<number, object> =>
  codes.reduce((acc, code) => {
    acc[code] = {
      description: ERROR_DESCRIPTIONS[code] ?? "Error",
      content    : { "application/json": { schema: ref("ErrorResponse") } },
    };
    return acc;
  }, {} as Record<number, object>);

// ── Route (operation) builders ─────────────────────────────────────────────
type OperationSpec = {
  summary     : string;
  description ?: string | string[];   // array is auto-joined with spaces
  secured     ?: boolean;             // true → requires Bearer token
  body        ?: object;
  responses   : object;
};

const buildOperation = (tag: string, spec: OperationSpec) => ({
  tags       : [tag],
  summary    : spec.summary,
  ...(spec.description
    ? { description: Array.isArray(spec.description) ? spec.description.join(" ") : spec.description }
    : {}),
  ...(spec.secured ? { security: [{ BearerAuth: [] }] } : {}),
  ...(spec.body ? { requestBody: spec.body } : {}),
  responses  : spec.responses,
});

/**
 * Returns verb helpers pre-tagged for a module.
 *   const { post, get, patch } = withTag("Auth")
 * Each returns a `{ <verb>: <operation> }` fragment ready to drop into a path.
 */
export const withTag = (tag: string) => ({
  get  : (spec: OperationSpec) => ({ get   : buildOperation(tag, spec) }),
  post : (spec: OperationSpec) => ({ post  : buildOperation(tag, spec) }),
  patch: (spec: OperationSpec) => ({ patch : buildOperation(tag, spec) }),
  put  : (spec: OperationSpec) => ({ put   : buildOperation(tag, spec) }),
  del  : (spec: OperationSpec) => ({ delete: buildOperation(tag, spec) }),
});
