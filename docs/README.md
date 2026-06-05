# Documentation Index

All project documentation lives here. Start with **Getting Started** if you are new, then read the section that matches your current task.

---

## Getting Started

| Document | What it covers |
|---|---|
| [`../README.md`](../README.md) | Project overview, quick-start, scripts, stack |
| [`architecture.md`](architecture.md) | System design, startup sequence, request flow, module map |
| [`conventions.md`](conventions.md) | Coding standards every contributor must follow |
| [`contributing.md`](contributing.md) | Branch strategy, commit format, PR process, feature checklist |

---

## Core Concepts

| Document | What it covers |
|---|---|
| [`auth-flow.md`](auth-flow.md) | Token lifecycle, email/password flow, social OAuth flow, session revocation |
| [`deployment.md`](deployment.md) | Docker setup, environment variables, production checklist |

---

## Feature Reference

One document per feature module. Each covers: endpoint table, auth requirements, request/response, business rules, file structure.

| Document | Feature |
|---|---|
| [`features/admin.md`](features/admin.md) | Admin user management (list, create, update, password, delete) |

> **Adding a new feature?** Copy the checklist from `CLAUDE.md` and create `docs/features/<feature>.md` before opening a PR.

---

## Patterns & Standards

Reusable patterns that apply across all feature modules. Read these before implementing a new list endpoint or utility.

| Document | What it covers |
|---|---|
| [`patterns/query-filter.md`](patterns/query-filter.md) | **Search, filter, sort, pagination** — the project-wide standard for every list endpoint |

---

## API Documentation (Swagger)

Interactive docs are served at **`/api/docs`** when running in development mode.

Covers:
- All `Auth` endpoints (register, login, logout, refresh, verify, reset, profile, change-password)
- All `Social Auth` endpoints (Google OAuth redirect + callback)
- All `Admin` endpoints (user CRUD + password management)
- Rate limit table in the spec description
- Shared schemas: `UserPublic`, `SuccessResponse`, `ErrorResponse`

Each feature module owns its own swagger file at `src/App/<Feature>/<feature>.swagger.ts`.

---

## Document Map

```
docs/
  README.md                    ← you are here — navigation index
  architecture.md              ← system design & startup flow
  auth-flow.md                 ← token lifecycle & OAuth flows
  conventions.md               ← coding standards
  contributing.md              ← PR process & branching
  deployment.md                ← Docker & env setup
  features/
    admin.md                   ← Admin module reference
  patterns/
    query-filter.md            ← Search/filter/pagination standard
```

---

## Quick Reference

**Which doc do I read when…**

| Situation | Read |
|---|---|
| I'm new to the project | `architecture.md` → `conventions.md` → `contributing.md` |
| I need to implement a list endpoint | `patterns/query-filter.md` |
| I need to understand login / tokens | `auth-flow.md` |
| I need to add a feature module | `conventions.md` + `contributing.md` (checklist) |
| I'm deploying or setting up Docker | `deployment.md` |
| I want to explore the API | Start the dev server → `/api/docs` |
