# MongoDB in Docker — Setup, Memory, and Reconfiguration Guide

## 1. Storage — disk vs RAM (the most important concept)

People often confuse these two. They are completely separate:

```
Your VPS hard disk (e.g. 50 GB SSD)
└── mongo_data Docker volume         ← ALL your data lives here permanently
      └── collection files, indexes  ← grows as you insert documents

Your VPS RAM (e.g. 4 GB)
└── MongoDB process (capped by Docker memory limit)
      └── WiredTiger cache           ← a hot copy of frequently read data
            └── evicted when full → re-read from disk on next access
```

**Your data is always on disk.** The RAM cache is just a speed layer. If your database is 20 GB on disk and your cache is 512 MB, MongoDB keeps the most-used 512 MB in RAM and reads everything else from disk on demand. The data is never lost — it just comes from disk instead of cache on a cache miss, which is slower.

---

## 2. What each memory value controls

| Setting | What it is | Where it lives |
|---------|-----------|----------------|
| `MONGO_WIREDTIGER_CACHE_GB` | MongoDB's internal read/write cache for hot data | MongoDB application config (`mongod` flag) |
| `MONGO_MEMORY_LIMIT` | Hard ceiling Docker puts on the entire container | Docker resource limit |
| `MONGO_MEMORY_RESERVATION` | Soft scheduling hint for Docker Swarm/clusters | Docker resource reservation |

### Why the Docker limit must be larger than the cache

MongoDB uses RAM for more than just the WiredTiger cache:

```
MONGO_MEMORY_LIMIT (e.g. 700 MB)
├── WiredTiger cache (e.g. 512 MB)   ← hot data
├── Query execution buffers          ┐
├── Connection threads (~1 MB each)  │ ~150–200 MB
├── Aggregation pipeline memory      │ total overhead
└── mongod process itself            ┘
```

Rule: **`MONGO_MEMORY_LIMIT` must be at least `MONGO_WIREDTIGER_CACHE_GB × 1024 + 200` MB.**

If Docker's limit is hit, Docker kills the container (OOM crash). Always leave headroom.

### Memory reservation

`MONGO_MEMORY_RESERVATION` is a soft hint used by Docker Swarm or Kubernetes to decide which node to place a container on. It is **not a cap** — the container can grow up to `MONGO_MEMORY_LIMIT`. On a single-server setup (Dokploy on one VPS) this value has minimal effect; set it to ~20% of the limit.

---

## 3. Environment variables reference

Set these in your `.env` file. All have safe defaults — only override when needed.

```env
# Credentials (init-only — read the reconfiguration section before changing)
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=your-strong-password
MONGO_DB_NAME=talkhead-backend

# Connection string for the app (uses the service name as host inside Docker)
MONGO_URI=mongodb://admin:your-strong-password@mongo-server:27017/talkhead-backend?authSource=admin

# Memory tuning (optional — defaults shown)
MONGO_WIREDTIGER_CACHE_GB=0.5   # 512 MB cache
MONGO_MEMORY_LIMIT=700M         # Docker hard limit
MONGO_MEMORY_RESERVATION=128M   # Docker soft hint
```

### Sizing guide by server RAM

| VPS RAM | Cache (`MONGO_WIREDTIGER_CACHE_GB`) | Docker limit (`MONGO_MEMORY_LIMIT`) |
|---------|-------------------------------------|--------------------------------------|
| 1 GB    | `0.25`                              | `450M`                               |
| 2 GB    | `0.5` (default)                     | `700M` (default)                     |
| 4 GB    | `1.0`                               | `1300M`                              |
| 8 GB    | `2.0`                               | `2400M`                              |

These assume Redis and the app are also running on the same server. If MongoDB is on a dedicated server, you can allocate 50–60 % of total RAM to the cache.

---

## 4. What happens between deploys — the critical section

Not all config changes behave the same way. This is the most important thing to understand before changing anything in production.

### Changes that are safe on any deploy

These only affect runtime behaviour. Container restarts, picks up new values, data is untouched.

| What you change | Effect |
|-----------------|--------|
| `MONGO_WIREDTIGER_CACHE_GB` | MongoDB restarts with new cache size. No data loss. |
| `MONGO_MEMORY_LIMIT` | Docker applies new container ceiling. No data loss. |
| `MONGO_MEMORY_RESERVATION` | Scheduling hint updated. No data loss. |

### Changes that are INIT-ONLY — dangerous after first deploy

`MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, and `MONGO_INITDB_DATABASE` (driven by `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, `MONGO_DB_NAME`) are **only read by MongoDB once — when the `mongo_data` volume is first created (empty).**

After that, MongoDB stores credentials inside the database files on disk and **never reads these env vars again.** Changing them in `.env` and redeploying will:

- Start the container successfully (mongod starts fine)
- Fail to authenticate — `MONGO_URI` now has the new password but MongoDB still has the old one stored on disk
- Your app will crash on startup with an authentication error

**Summary:**

| Scenario | What happens |
|----------|-------------|
| First deploy (empty volume) | MongoDB reads `MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD`, creates the root user, writes to disk |
| Subsequent deploy, credentials unchanged | MongoDB starts normally, ignores the init env vars |
| Subsequent deploy, password changed in `.env` | MongoDB starts but app auth fails — old password is still in the database |
| Subsequent deploy, username changed in `.env` | Old username still exists, new one is not created — auth fails |

---

## 5. How to change the password after first deploy

**Always change the password inside MongoDB first, then update `.env`. Never the other way around** — if you update `.env` first the app loses its connection between steps.

**Step 1 — connect to the running container:**
```bash
docker compose exec mongo-server mongosh \
  --username admin \
  --password old-password \
  --authenticationDatabase admin
```

**Step 2 — change the password inside MongoDB:**
```js
use admin
db.changeUserPassword("admin", "new-strong-password")
```

**Step 3 — update `.env`** with the new password in both `MONGO_ROOT_PASSWORD` and `MONGO_URI`, then redeploy:
```bash
docker compose up -d
```

---

## 6. How to change the username after first deploy

You cannot rename a MongoDB user. The correct approach is: create the new user, verify it works, then delete the old one.

**Step 1 — connect as the current user:**
```bash
docker compose exec mongo-server mongosh \
  --username old-username \
  --password your-password \
  --authenticationDatabase admin
```

**Step 2 — create the new username with the same privileges:**
```js
use admin
db.createUser({
  user: "new-username",
  pwd:  "your-password",      // can be the same password or a new one
  roles: [{ role: "root", db: "admin" }]
})
```

**Step 3 — update `.env`** with the new username in both `MONGO_ROOT_USERNAME` and `MONGO_URI`, then redeploy:
```bash
docker compose up -d
```

**Step 4 — verify the app starts and connects successfully**, then remove the old user:
```bash
docker compose exec mongo-server mongosh \
  --username new-username \
  --password your-password \
  --authenticationDatabase admin
```
```js
use admin
db.dropUser("old-username")
```

> Always verify the new credentials work before dropping the old user. If you drop it first and something is wrong, you are locked out.

---

## 7. What happens when you change cache size or memory limits between deploys

Unlike credentials, memory settings are **always safe to change at any time**. They are just `mongod` startup flags and Docker resource settings — MongoDB re-reads them fresh on every restart. Your data on disk is never touched.

### Increasing the cache (`MONGO_WIREDTIGER_CACHE_GB`)

```
Before:  cache = 0.5 GB (512 MB)
After:   cache = 1.0 GB (1024 MB)
```

- MongoDB restarts and allocates more RAM for the cache
- Over the next few minutes it gradually loads more hot data from disk into the larger cache
- Queries become progressively faster as the cache warms up
- **No data loss. No downtime beyond the container restart.**

> Remember to also increase `MONGO_MEMORY_LIMIT` when increasing the cache — the Docker limit must always stay above the cache size plus ~200 MB overhead.

### Decreasing the cache (`MONGO_WIREDTIGER_CACHE_GB`)

```
Before:  cache = 1.0 GB (1024 MB)
After:   cache = 0.5 GB (512 MB)
```

- MongoDB restarts and immediately evicts data that no longer fits in the smaller cache
- Queries that previously hit cache will now hit disk — expect a temporary slowdown for a few minutes until the cache settles on the most-used data
- **No data loss. Nothing is deleted from disk.**

### Changing the Docker memory limit (`MONGO_MEMORY_LIMIT`)

```
Before:  MONGO_MEMORY_LIMIT=700M
After:   MONGO_MEMORY_LIMIT=1300M
```

- Docker applies the new ceiling on restart — no MongoDB restart required
- **No data loss.**
- ⚠️ If you set the limit *below* the current cache size, MongoDB will be killed by Docker (OOM). Always keep `MONGO_MEMORY_LIMIT` > `MONGO_WIREDTIGER_CACHE_GB × 1024 + 200 MB`.

### Summary table

| What you change | Safe? | Data loss? | Effect on restart |
|----------------|-------|-----------|-------------------|
| `MONGO_WIREDTIGER_CACHE_GB` ↑ | ✅ | None | Cache grows, warms up gradually |
| `MONGO_WIREDTIGER_CACHE_GB` ↓ | ✅ | None | Cache shrinks, temporary slowdown |
| `MONGO_MEMORY_LIMIT` ↑ | ✅ | None | More headroom for the container |
| `MONGO_MEMORY_LIMIT` ↓ below cache + 200 MB | ❌ | None (but container crashes) | OOM kill |
| `MONGO_ROOT_PASSWORD` in `.env` only | ❌ | None (but app auth fails) | See section 5 |
| `MONGO_ROOT_USERNAME` in `.env` only | ❌ | None (but app auth fails) | See section 6 |

---

## 8. Starting fresh (wipe all data)

Only do this in development. **This deletes every document in every collection.**

```bash
docker compose down -v      # -v removes named volumes including mongo_data
docker compose up --build   # fresh start — MongoDB re-runs init
```

---

## 9. Checking MongoDB status

```bash
# View logs
docker compose logs mongo-server

# Connect interactively
docker compose exec mongo-server mongosh \
  --username admin \
  --password your-password \
  --authenticationDatabase admin

# Check server stats inside mongosh
db.serverStatus().wiredTiger.cache
db.stats()
```
