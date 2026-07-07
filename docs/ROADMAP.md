# Architecture Roadmap & Decisions

> **Status: direction, partly implemented.** This document records where the app is going and _why_. As of this writing, **Stages 1–2 are done**: TypeScript, then friendships + FCM tokens moved to Postgres behind Drizzle. **Messages** still live only in Redis (see "Current state" below). Do not read the later roadmap stages as descriptions of current behavior. Each stage lands as its own separate plan/PR.

## Why this exists

The app historically treated **Redis as its primary database**: messages and the friendship graph lived **only** in Redis as fragile dot-joined strings — `"messageId.to.from.content"` and `"username.user_id"` — pushed to two keys each with **no transactionality**. Stage 2 has since moved friendships to Postgres; **messages** remain the last misplaced slice. The original consequences that motivated this work:

- A Redis flush = **permanent loss** of all messages and the entire social graph.
- Message content containing a `.` corrupts on parse (known bug, e.g. `"3.14"`).
- Mutual add/remove does two sequential writes with no `MULTI`, so a mid-write failure leaves the two sides inconsistent.

Postgres today holds only the `users` table + an `fcm_token[]` column. The goal is to make the app professional, scalable, and eventually **microservices / Kubernetes-ready**, by putting durable data where it belongs and narrowing Redis to what it's actually good at.

### Current state (what's true today)

| Data                                    | Home today                                              | Correct?                        |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------- |
| Users (id, username, passhash, user_id) | Postgres                                                | ✅                              |
| FCM tokens                              | Postgres `fcm_tokens` table + Redis cache-aside         | ✅ (normalized, Stage 2)        |
| Presence (`connected` flag)             | Redis hash `user_id:<username>`                         | ✅ ephemeral                    |
| Rate-limit counters                     | Redis (TTL keys)                                        | ✅ ephemeral                    |
| **Friendships**                         | Postgres `friendships` (canonical row) + Redis presence | ✅ (Stage 2)                    |
| **Messages**                            | **Redis only** (`chat:<user_id>` lists, dot-joined)     | ❌ → move to Postgres (Stage 3) |

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
- **Typed Socket.io event contracts (deferred from Stage 1 — its own PR):** Stage 1 typed `socket.user` (a `declare module "socket.io"` augmentation) but left event **payloads** as `DefaultEventsMap`, so `socket.emit(...)` / `socket.on(...)` are **not** payload-checked (event name and arg shapes are effectively `any`). Follow-up:
    1. Define `ClientToServerEvents`, `ServerToClientEvents`, `InterServerEvents`, `SocketData` interfaces with typed payloads (e.g. `direct_message: (m: { to: string; content: string }, cb: (r: Ack) => void) => void`), keyed off the `SOCKET_EVENTS` string values.
    2. Put them in **`common`** — they are the shared realtime contract, which aligns with the "`common` → published contracts" direction (Decision D10).
    3. Parameterize `Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>` / `Socket<…>` on the server, and the client's socket instance, so every `emit`/listener is compile-checked end to end.
    - **Why deferred:** invasive — touches `packages/server/index.ts`, every `packages/server/utils/socket/*` handler, and the client's `utils/socket.js` + `useSocketSetup.jsx`. Kept out of the Stage 1 migration to stay reviewable.
    - **Optional smaller precursor (cheap, additive):** in `common/index.ts`, add `satisfies Record<string, string>` guards to `SOCKET_EVENTS`/`API_ROUTES` and export a derived `type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS]`. (This is _not_ an enum — `as const` + derived unions is the recommended pattern here; enums aren't erasable under `isolatedModules`/`--experimental-strip-types` and don't travel across the future service boundary.)

---

## Guiding principles for all future work (Option A)

1. **Postgres = source of truth; Redis = speed + realtime, never the only copy.** Litmus test per Redis key: _"If flushed now — cache miss or data loss?"_ Data loss ⇒ it belongs in Postgres.
2. **Database-per-context boundaries.** Design schemas so each domain (auth/users, friendships, messaging) is cohesive and separable. Cross-context references go through `user_id` (a stable value), **not** hard foreign keys that straddle future service lines.
3. **Stateless services.** No per-instance in-memory state. The existing in-memory disconnect timers + single-instance `connected` boolean are the current scaling blockers — move realtime coordination into shared Redis + the Socket.io Redis pub/sub adapter.
4. **Contract-based, loosely coupled.** Decouple side effects (e.g. `directMessage.js` directly calling `getFcmTokens` → later emit a `MessageSent` event) so the notification path can split out cleanly.

---

## Staged Roadmap

### Stage 1 — TypeScript migration (server + common) ✅ DONE

`packages/server` and `packages/common` are TypeScript; `packages/client` stays JS (Vite/esbuild consumes the TS `common` fine). **Resolved the open build question in favour of `tsx` runtime** (over `tsc` build-to-dist or Node `--experimental-strip-types`): dev = `tsx watch`, prod = `tsx index.ts`, and a `tsc --noEmit` CI gate enforces types. No `dist/`, no build-ordering, and **Render/Netlify deploy commands are unchanged** — compiled artifacts are deferred to Stage 4 (Docker). Files were renamed `.js`→`.ts` keeping the existing explicit `.js` import specifiers (both `tsx` and `tsc` with `moduleResolution: NodeNext` resolve them to the `.ts` sources).

Tooling landed: root `tsconfig.base.json` + per-package `tsconfig.json` (`strict: true`, `NodeNext`, `verbatimModuleSyntax`, `isolatedModules`), `tsx` (server runtime dep), `typescript-eslint` in both eslint configs (`common` gained its first lint config), `.test.ts` vitest globs, `.lintstagedrc` `*.{js,ts}`, e2e boot via `node --import tsx`, and a CI **Typecheck** step. Tricky typings handled deliberately:

- pg-promise `pool.query` resolves to a **row array** (not `{ rows }`) — call-site generics.
- JWT helpers return Go-style `[err, result]` tuples — modelled as discriminated tuple unions in `utils/jwt.ts`; `JWT_SECRET` now fails fast at boot if unset.
- `socket.user` is typed via a `declare module "socket.io"` augmentation (`types/socket.ts`, `AuthedUser`). **Event payloads were left as `DefaultEventsMap`** (pragmatic) — full typed `emit`/`on` contracts are a deferred follow-up, see "Typed Socket.io event contracts" under _Deferred / open decisions_.
- The dead `SOCKET_EVENTS.FRIEND_REQUEST_RECEIVED` listener (an undefined event name → no-op) was removed; strict typing surfaced it.
- (Client's misspelled `SocketContextProvide` is out of scope now.)

**Scoping note:** the strict `tsc` gate covers the **whole server + common package, tests included** (`exclude` is just `node_modules`/`coverage`). Test mocks are typed with `as unknown as Socket`/`Request`/`Response` casts and a vitest `ProvidedContext` augmentation (`test/integration/vitest-context.d.ts`) for the `provide`/`inject` channel — so the editor and CI agree everywhere, with no `@ts-nocheck` escape hatches.

### Stage 2 — Drizzle + friendships → Postgres ✅ DONE

Adopted **Drizzle** as the single data-access layer and migration authority (`drizzle-kit`); **removed pg-promise and node-pg-migrate**. The existing `users` table was re-expressed as a Drizzle migration (safe — no live data), so there is a single clean migration history under `packages/server/drizzle/`.

- **Friendships → Postgres:** a `friendships` table storing **one canonical row per pair** (`user_a_id < user_b_id`, CHECK-enforced, plus a UNIQUE) — a single-row insert/delete is atomic by construction, which is the strongest form of the "transactional mutual add/remove" fix (replaces the old non-atomic dual `lPush`/`lRem`). Canonicalisation is done in SQL (`LEAST`/`GREATEST`) so it always agrees with the CHECK under any collation. `getFriends` **joins `users`** for usernames — usernames stay in `users`, not denormalized. `user_id` refs, **no** cross-context FK (principle 2). The Redis `friends:*` lists are removed; presence (`connected`) stays in Redis and enriches reads.
- **FCM normalization (folded into this stage):** `users.fcm_token VARCHAR(255)[]` was a **1NF violation**; replaced by an `fcm_tokens` child table (one row per `(user_id, token)`), keeping the Redis cache-aside `string[]` contract identical. No FK to `users`, so an authenticated token-save succeeds even for a since-deleted user (the prior 500 was an incidental crash, not a designed check).
- **Data-access layout:** `db/schema.ts`, `db/index.ts` (pooled `pg` client), `db/repositories/{users,fcmTokens,friendships}.ts`. Auth queries were converted off pg-promise too → **one library, one connection pool**.
- **New rule:** tables must be normalized; see [`DATABASE_NORMALIZATION.md`](DATABASE_NORMALIZATION.md) — a generic, project-agnostic reference used when adding tables.

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
