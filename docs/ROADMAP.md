# Architecture Roadmap & Decisions

> **Status: direction, mostly not-yet-implemented.** This document records where the app is going and _why_. As of this writing, messages and friendships still live only in Redis (see "Current state" below). Do not read the roadmap stages as descriptions of current behavior. Each stage lands as its own separate plan/PR.

## Why this exists

The app currently treats **Redis as its primary database**: messages and the friendship graph live **only** in Redis as fragile dot-joined strings — `"messageId.to.from.content"` and `"username.user_id"` — pushed to two keys each with **no transactionality**. Consequences:

- A Redis flush = **permanent loss** of all messages and the entire social graph.
- Message content containing a `.` corrupts on parse (known bug, e.g. `"3.14"`).
- Mutual add/remove does two sequential writes with no `MULTI`, so a mid-write failure leaves the two sides inconsistent.

Postgres today holds only the `users` table + an `fcm_token[]` column. The goal is to make the app professional, scalable, and eventually **microservices / Kubernetes-ready**, by putting durable data where it belongs and narrowing Redis to what it's actually good at.

### Current state (what's true today)

| Data                                    | Home today                                              | Correct?              |
| --------------------------------------- | ------------------------------------------------------- | --------------------- |
| Users (id, username, passhash, user_id) | Postgres                                                | ✅                    |
| FCM tokens                              | Postgres `users.fcm_token[]` + Redis cache-aside        | ✅                    |
| Presence (`connected` flag)             | Redis hash `user_id:<username>`                         | ✅ ephemeral          |
| Rate-limit counters                     | Redis (TTL keys)                                        | ✅ ephemeral          |
| **Messages**                            | **Redis only** (`chat:<user_id>` lists, dot-joined)     | ❌ → move to Postgres |
| **Friendships**                         | **Redis only** (`friends:<username>` lists, dot-joined) | ❌ → move to Postgres |

---

## Decision Log

| #   | Decision                                                                                                                                                                                                       | Rationale                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Redis is not a database.** Narrow it to cache + pub/sub + ephemeral state only.                                                                                                                              | Redis durability (RDB/AOF) is secondary; unsafe as source of truth for data you can't lose.                                                                                                                                     |
| D2  | **Postgres = source of truth** for durable/relational data (messages, friendships).                                                                                                                            | Durable, transactional, relational, queryable. Fixes the dot-delimiter corruption + non-transactional dual writes.                                                                                                              |
| D3  | **Keep as-is (already correct):** presence (`connected`), FCM cache-aside, rate-limit TTL keys.                                                                                                                | Genuinely ephemeral / correctly cache-over-Postgres today. **Do NOT touch.**                                                                                                                                                    |
| D4  | **Adopt TypeScript** — server + `common` first; client (JSX) deferred.                                                                                                                                         | 2026 consensus for 3+ devs / 6+ months / complex logic. Refactor safety + typed contracts, especially valuable during the data-layer migration and scaling rework.                                                              |
| D5  | **ORM = Drizzle** (over Prisma / Kysely).                                                                                                                                                                      | ~5KB, no engine binary, no lock-in, SQL-shaped (matches existing raw SQL), fastest. Best fit for k8s/microservices (small images, fast cold starts). Prisma's ~50MB engine-per-image + DSL lock-in count against the direction. |
| D6  | **Sequencing:** TypeScript first (isolated, reviewable) → then Drizzle + Postgres migration.                                                                                                                   | Avoids writing the risky data layer twice; each change reviewable in isolation.                                                                                                                                                 |
| D7  | **First data slice = friendships**, clean cutover (no backfill).                                                                                                                                               | Smaller, cleaner relational model; establishes the schema→repository pattern + transactional integrity before the bigger messages work. Dev/practice data — nothing to preserve.                                                |
| D8  | **Dockerize = separate later step**, after the data migration is stable.                                                                                                                                       | Keeps each plan small; Compose comes once the data layer settles.                                                                                                                                                               |
| D9  | **Microservices posture = Option A: microservices-_ready_ monolith.** Stay one deployable now; enforce clean context boundaries + stateless design so a future split is mechanical. Not splitting now (YAGNI). | Build for future microservices/k8s from now on, without paying the cost prematurely.                                                                                                                                            |
| D10 | **Do not weight the shared `common` package** in decisions.                                                                                                                                                    | As a build-time workspace symlink it's a monolith convenience; it won't survive a microservices split (becomes versioned/published contracts). TS + Drizzle stand on their own per-service merits.                              |

### Deferred / open decisions

- **Redis role for migrated data:** default = read straight from Postgres (Redis only for presence / pub-sub / rate-limit); add a read cache later **only if profiling shows need**. Revisit per slice.
- **Client → TypeScript:** yes eventually, not scheduled yet.

---

## Guiding principles for all future work (Option A)

1. **Postgres = source of truth; Redis = speed + realtime, never the only copy.** Litmus test per Redis key: _"If flushed now — cache miss or data loss?"_ Data loss ⇒ it belongs in Postgres.
2. **Database-per-context boundaries.** Design schemas so each domain (auth/users, friendships, messaging) is cohesive and separable. Cross-context references go through `user_id` (a stable value), **not** hard foreign keys that straddle future service lines.
3. **Stateless services.** No per-instance in-memory state. The existing in-memory disconnect timers + single-instance `connected` boolean are the current scaling blockers — move realtime coordination into shared Redis + the Socket.io Redis pub/sub adapter.
4. **Contract-based, loosely coupled.** Decouple side effects (e.g. `directMessage.js` directly calling `getFcmTokens` → later emit a `MessageSent` event) so the notification path can split out cleanly.

---

## Staged Roadmap

### Stage 1 — TypeScript migration (server + common) ← next executable stage

Convert `packages/server` and `packages/common` to TS; leave `packages/client` as JS (Vite consumes TS `common` fine). Tooling: `tsconfig` per package, build / `nodemon` / `vitest` / `eslint` / `lint-staged` / CI updates; decide `tsc` build vs runtime type-strip (`tsx` / Node 22 `--experimental-strip-types`). Tricky typings to handle deliberately:

- pg-promise `pool.query` resolves to a **row array** (not `{ rows }`).
- JWT helpers return Go-style `[err, result]` tuples.
- Socket.io event payload types (drive off `SOCKET_EVENTS` in `common`).
- (Client's misspelled `SocketContextProvide` is out of scope now.)

### Stage 2 — Drizzle + friendships → Postgres (clean cutover)

Add Drizzle + a `friendships` table; repository layer; **transactional** mutual add/remove (fixes today's non-atomic dual `lPush`/`lRem`); read friend lists from Postgres; remove the Redis `friends:*` keys. `user_id`-based references (no cross-context FKs, per principle 2).

### Stage 3 — messages → Postgres

`messages` table with proper columns (kills the dot-delimiter bug); history + pagination; rework the connect-time `MESSAGES` load. Emit a `MessageSent`-style event on send to decouple FCM (principle 4).

### Stage 4 — Dockerize (Compose)

`docker-compose`: backend + Postgres + Redis; static frontend via Netlify/CDN. On-ramp to k8s; maps ~1:1 to future manifests.

### Stage 5 — Presence rework + Socket.io Redis adapter (scaling prerequisite)

Move in-memory disconnect timers + single-instance `connected` flag into shared Redis; add the Socket.io Redis pub/sub adapter so any instance/pod delivers to any user's room. Makes the realtime gateway stateless & horizontally scalable.

### Stage 6 — Microservices extraction (future, not scheduled)

Split into: **Auth/Identity**, **Social/Friendship**, **Messaging**, **Realtime Gateway** (thin, stateless, holds sockets), **Notification** (event-driven, easiest first extraction). Replace build-time `common` with versioned/published contracts. Database-per-service.

---

## Deployment targets (reference)

- **Proper way:** stateless app container + **managed Postgres** (Cloud SQL / RDS / Neon) + **managed Redis** (Memorystore / ElastiCache / Upstash) on **Cloud Run / App Runner / Fargate**, graduating to **managed k8s (GKE/EKS/AKS)**. App containers disposable; all state in managed services.
- **Free / scale-to-zero:** **Render** or **Koyeb** free tier (Docker + free Postgres; server cold-starts after ~15 min idle), or **Cloud Run + Neon + Upstash** (best "free but same shape as proper"). Frontend static on Netlify / Cloudflare Pages. _(Fly.io dropped its free tier; Railway ≈ $1/mo credit.)_
- Both scenarios share one shape — stateless container + managed PG + managed Redis — so free → paid needs no re-architecture.
