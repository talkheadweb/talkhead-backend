# How to Promote Your First Admin User

This guide is for the very first time you need an admin account on a production server.
The assumption is: you already have a regular user account (registered through the app).
All you need to do is update that account's role from `user` to `admin` directly in the database.

After the first admin exists, you can promote anyone else through the API
(`PATCH /api/v1/admin/users/:id` with `{ "role": "admin" }`) — no more direct DB access needed.

---

## Prerequisites

- SSH access to your server
- The server is running (`docker compose up -d` already done)
- You have registered at least one user account through the app

---

## Step 1 — SSH into your server

From your local machine, connect to the server:

```bash
ssh your-user@your-server-ip
```

Example:
```bash
ssh root@192.168.1.100
```

Once connected, navigate to the project directory where your `docker-compose.yml` lives:

```bash
cd /path/to/your/project
```

---

## Step 2 — Open a shell inside the MongoDB container

Run this command to connect to the MongoDB container:

```bash
docker compose exec mongo-server mongosh \
  --username admin \
  --password your-mongo-root-password \
  --authenticationDatabase admin
```

Replace `your-mongo-root-password` with the value of `MONGO_ROOT_PASSWORD` from your `.env` file.

You should see the `mongosh` prompt:
```
test>
```

---

## Step 3 — Switch to your application database

```js
use talkhead-backend
```

Replace `talkhead-backend` with the value of `MONGO_DB_NAME` from your `.env` if you changed it.

The prompt changes to:
```
talkhead-backend>
```

---

## Step 4 — Verify the user exists

Before making any change, confirm the email is correct:

```js
db.users.findOne({ email: "your@email.com" })
```

You should see the full user document. Check that:
- `email` matches exactly (case-sensitive)
- `role` is currently `"user"`

If you see `null`, the email is wrong — go back and check what you registered with.

---

## Step 5 — Promote the user to admin

```js
db.users.updateOne(
  { email: "your@email.com" },
  { $set: { role: "admin", updatedAt: new Date() } }
)
```

Expected output:
```
{ acknowledged: true, matchedCount: 1, modifiedCount: 1 }
```

- `matchedCount: 1` → the email was found
- `modifiedCount: 1` → the role was changed

If `modifiedCount: 0` but `matchedCount: 1`, the role was already `"admin"`.

---

## Step 6 — Confirm the change

Double-check the update took effect:

```js
db.users.findOne({ email: "your@email.com" }, { email: 1, role: 1, _id: 0 })
```

Expected output:
```json
{ email: "your@email.com", role: "admin" }
```

---

## Step 7 — Exit mongosh

```js
exit
```

You are back in the server shell. The change is live immediately — no restart needed.

---

## Step 8 — Verify through the API (optional but recommended)

Log in through the app with that account and call a protected admin endpoint to confirm the role is active:

```bash
curl -X GET https://your-api-domain.com/api/v1/admin/users \
  -H "Authorization: Bearer <your-access-token>"
```

You should get a `200` response with the user list. A `403` means the role change did not take effect — re-check Step 5.

---

## From now on — promoting other users

Once you have one admin account, use the dedicated role endpoint to promote or demote anyone.
No more database access needed.

```
PATCH /api/v1/admin/users/:id/role
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{ "role": "admin" }   // or "user" to demote
```

The user's active session is revoked immediately on role change — they must log in again
for the new role to take effect in their JWT.

Replace `:id` with the MongoDB `_id` of the user you want to promote.
You can find their `_id` from `GET /api/v1/admin/users?search=their@email.com`.

---

## Quick reference (all steps in one block)

```bash
# 1. SSH into the server
ssh your-user@your-server-ip

# 2. Go to the project directory
cd /path/to/your/project

# 3. Enter the MongoDB container
docker compose exec mongo-server mongosh \
  --username admin \
  --password your-mongo-root-password \
  --authenticationDatabase admin

# 4. Inside mongosh — switch database
use talkhead-backend

# 5. Confirm the user exists
db.users.findOne({ email: "your@email.com" })

# 6. Promote to admin
db.users.updateOne(
  { email: "your@email.com" },
  { $set: { role: "admin", updatedAt: new Date() } }
)

# 7. Verify
db.users.findOne({ email: "your@email.com" }, { email: 1, role: 1, _id: 0 })

# 8. Exit
exit
```
