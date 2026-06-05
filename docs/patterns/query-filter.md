# Query, Filter & Pagination Pattern

This document is the **authoritative reference** for how every list endpoint in this project handles search, filtering, sorting, and pagination. Follow it exactly — consistency across the codebase is the goal.

---

## Overview

Every list endpoint uses a two-layer architecture:

```
req.query
    │
    ▼
queryOptimization()   ← Controller (extracts structured IQueryItems payload)
    │
    ▼
IQueryItems<T>        ← passed to service
    │
    ▼
$and conditions loop  ← Service (builds MongoDB query from keys + schema types)
    │
    ▼
Model.find($and)      ← Database
```

Raw `req.query` **never** reaches the service. The controller normalises it; the service builds the query.

---

## Step 1 — Define key constants in `types.ts`

Every feature module that has a list endpoint declares its key constants in `<feature>/types.ts`.

```ts
import { IMyModel } from "./model-or-types";
import { IQueryItems } from "@/Utils/types/query.type";

// ── Search keys ────────────────────────────────────────────────────────────
// Fields matched with a case-insensitive regex $or when `?search=` is sent.
// Always treated as String type regardless of the schema type.
export const MyFeatureSearchKeys: (keyof IMyModel)[] = ["name", "email"];

// ── Filter keys ────────────────────────────────────────────────────────────
// Fields available as discrete ?key=value query params.
// These MUST be fields that exist in the Mongoose schema — type is read
// automatically from schema.path(key).instance at runtime.
export const MyFeatureFilterKeys: (keyof IMyModel)[] = ["status", "isActive", "category"];

// ── Extra filter keys ──────────────────────────────────────────────────────
// For keys that are NOT on the schema (computed, joined, or virtual fields).
// Usually empty. Pass these as the third arg to queryOptimization().
export const MyFeatureExtraFilterKeys: string[] = [];

// ── Payload type ───────────────────────────────────────────────────────────
// The structured payload the controller hands to the service.
export type TListMyFeaturePayload = IQueryItems<Partial<IMyModel>>;
```

**Rules:**
- `SearchKeys` → model fields you want full-text searched
- `FilterKeys` → model fields that can be filtered by exact/typed value; must exist in the schema
- `ExtraFilterKeys` → non-schema keys (empty in most cases)
- Never put the same key in both `FilterKeys` and `ExtraFilterKeys`

---

## Step 2 — Controller

The controller's only job is to call `queryOptimization` and forward the result.

```ts
import { queryOptimization } from "@/Utils/helper/queryOptimize";
import catchAsync from "@/Utils/helper/catchAsync";
import { sendResponse } from "@/Utils/helper/sendResponse";
import { IMyModel } from "./types";
import {
  MyFeatureFilterKeys,
  MyFeatureExtraFilterKeys,
} from "./types";

const listItems = catchAsync(async (req, res) => {
  const payload = queryOptimization<IMyModel>(
    req,
    MyFeatureFilterKeys,
    MyFeatureExtraFilterKeys,
  );
  const { items, meta } = await MyFeatureService.list(payload);
  sendResponse.success(res, { statusCode: 200, message: "Items fetched successfully.", data: items, meta, req });
});
```

`queryOptimization` picks only the declared keys from `req.query` and returns a typed `IQueryItems<Partial<IMyModel>>` — search, filter, pagination, and sort fields are cleanly separated.

---

## Step 3 — Service

The service builds a `$and` conditions array. The filter loop reads each key's type directly from the Mongoose schema — no manual type map.

```ts
import { calculatePagination, manageSorting, MongoQueryHelper } from "@/Utils/helper/queryOptimize";
import { Types } from "mongoose";
import MyModel from "./model";
import {
  MyFeatureSearchKeys,
  MyFeatureFilterKeys,
  TListMyFeaturePayload,
} from "./types";

const list = async (query: TListMyFeaturePayload) => {
  const { page, limit, skip } = calculatePagination(query.paginationFields);
  const { sortBy, sortOrder } = manageSorting<IMyModel>(query.sortFields);

  const { search }   = query.searchFields as { search?: string };
  const filterFields = query.filterFields as Record<string, string>;

  const queryConditions: Record<string, unknown>[] = [];

  // ── Search ──────────────────────────────────────────────────────────────
  if (search) {
    const orConditions = MyFeatureSearchKeys.map(key =>
      MongoQueryHelper("String", String(key), search),
    );
    // ObjectId special case: add _id match only when value is a valid ObjectId
    if (Types.ObjectId.isValid(search)) orConditions.push({ _id: String(search) });
    queryConditions.push({ $or: orConditions });
  }

  // ── Filters ─────────────────────────────────────────────────────────────
  for (const key of MyFeatureFilterKeys) {
    const value = filterFields[String(key)];
    if (!value) continue;

    // CUSTOM OVERRIDE SLOT ─────────────────────────────────────────────────
    // When a key needs complex logic (nested match, $in, $elemMatch, etc.),
    // handle it here and `continue` to skip the schema-default below.
    //
    // Example — comma-separated list filter:
    // if (key === 'tags') {
    //   const list = value.split(',').map(s => s.trim()).filter(Boolean);
    //   queryConditions.push({ tags: { $in: list } });
    //   continue;
    // }
    //
    // Example — nested participants array:
    // if (key === 'hotkey') {
    //   queryConditions.push({ participants: { $elemMatch: { hotkey: value } } });
    //   continue;
    // }
    // ──────────────────────────────────────────────────────────────────────

    // Default: Mongoose instance name IS the MongoQueryHelper type — no translation needed
    const instance = MyModel.schema.path(String(key))?.instance as
      Parameters<typeof MongoQueryHelper>[0] | undefined;
    if (instance) queryConditions.push(MongoQueryHelper(instance, String(key), value));
  }

  const mongoQuery = queryConditions.length ? { $and: queryConditions } : {};

  const [docs, total] = await Promise.all([
    MyModel.find(mongoQuery)
      .sort({ [String(sortBy)]: sortOrder })   // "asc" | "desc" accepted directly by Mongoose
      .skip(skip)
      .limit(limit)
      .lean(),
    MyModel.countDocuments(mongoQuery),
  ]);

  return {
    items: docs,
    meta : { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};
```

---

## How type derivation works

Mongoose exposes `schema.path(fieldName).instance` which returns one of:

| Mongoose `instance` | MongoQueryHelper type | MongoDB output |
|---|---|---|
| `"String"` | `"String"` | `{ $regex: value, $options: "i" }` |
| `"Boolean"` | `"Boolean"` | `{ field: true }` or `{ field: false }` |
| `"Number"` | `"Number"` | `{ field: 42 }` |
| `"Date"` | `"Date"` | `{ $gte: startOfDay, $lte: endOfDay }` |
| `"ObjectId"` | `"ObjectId"` | `{ field: "..." }` (validated) |

These strings are **identical**, so no translation map is needed. The schema is the single source of truth — if the field type changes in the schema, the filter type updates automatically.

---

## MongoQueryHelper reference

```ts
MongoQueryHelper(type, fieldName, value)
```

| Type | Input | MongoDB fragment |
|---|---|---|
| `"String"` | `"alice"` | `{ name: { $regex: "alice", $options: "i" } }` |
| `"Boolean"` | `"true"` / `"false"` | `{ isActive: true }` |
| `"Number"` | `"42"` | `{ price: 42 }` |
| `"Date"` | `"2024-01-15"` | `{ createdAt: { $gte: startOfDay, $lte: endOfDay } }` |
| `"ObjectId"` | `"507f..."` | `{ userId: "507f..." }` |
| `"NumberRange"` | `{ min: "10", max: "100" }` | `{ price: { $gte: 10, $lte: 100 } }` |

`NumberRange` is the only type that takes an object instead of a string — use it manually when you need min/max range filtering:
```ts
queryConditions.push(
  MongoQueryHelper("NumberRange", "price", {
    min: filterFields.minPrice,
    max: filterFields.maxPrice,
  }),
);
```

---

## Supported query parameters (all list endpoints)

| Param | Description | Default |
|---|---|---|
| `search` | Full-text search across `SearchKeys` fields (regex) and `_id` (if valid ObjectId) | — |
| `page` | Page number | `1` |
| `limit` | Items per page | `10` |
| `sortBy` | Field to sort by | `createdAt` |
| `sortOrder` | `asc` or `desc` | `desc` |
| *(filter keys)* | Each key declared in `FilterKeys` / `ExtraFilterKeys` | — |

---

## Testing list endpoints

Because the filter loop calls `Model.schema.path()`, the mock for `Model` must preserve the real schema:

```ts
// In your test file — preserve the real schema while mocking DB methods
jest.mock("@/App/MyFeature/model", () => {
  const actual = jest.requireActual("@/App/MyFeature/model");
  return {
    __esModule: true,
    default: {
      find          : jest.fn(),
      countDocuments: jest.fn(),
      schema        : actual.default.schema,   // ← keep the real schema
    },
  };
});
```

Other test files that only test non-list endpoints (create, get, update, delete) can use a plain `jest.mock("@/App/MyFeature/model")` auto-mock.

---

## Quick checklist for a new list endpoint

```
[ ] SearchKeys  defined in types.ts  (model fields for $or regex search)
[ ] FilterKeys  defined in types.ts  (model fields for typed discrete filters)
[ ] ExtraFilterKeys defined          (non-schema extras, usually [])
[ ] TListPayload type alias defined  (IQueryItems<Partial<IModel>>)
[ ] Controller calls queryOptimization() and passes payload to service
[ ] Service uses calculatePagination + manageSorting + $and conditions loop
[ ] Custom overrides added for any key needing non-standard query logic
[ ] Swagger documents all filter/search/sort/pagination query params
[ ] Test mocks preserve Model.schema for the list endpoint test file
[ ] Test covers: 200 list, search param, filter param, 401, 403
```
