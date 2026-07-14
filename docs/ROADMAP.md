# Architecture Roadmap & Decisions

> **Status: direction, partly implemented.** This document records where the app is going and _why_. As of this writing, **Stages 1–4 are done** — TypeScript, then friendships + FCM tokens moved to Postgres behind Drizzle, then **messages moved to Postgres** (with history/pagination for both messages and the friends list, and FCM decoupled onto a Redis pub/sub event), then **Stage 4**: the container image + Compose stack (4a), an **AWS deployment validated end to end** on ECS Fargate + RDS + ElastiCache + ALB (4b), and that same stack **rebuilt as Terraform** under [`infra/`](../infra/README.md) (4c). AWS is an on-demand environment, applied and destroyed on purpose; production stays on Render/Netlify. **Stage 5 (presence rework + the Socket.io Redis adapter) is next** — and 4b/4c made the need for it concrete: the ALB currently needs sticky sessions because two tasks cannot serve each other's connected users. **All durable data now lives in Postgres**; Redis is cache + presence + pub/sub only. Do not read the later roadmap stages as descriptions of current behavior. Each stage lands as its own separate plan/PR.

## Why this exists

The app historically treated **Redis as its primary database**: messages and the friendship graph lived **only** in Redis as fragile dot-joined strings — `"messageId.to.from.content"` and `"username.user_id"` — pushed to two keys each with **no transactionality**. Stages 2–3 have since moved friendships **and messages** to Postgres — the Redis primary-datastore problem is now fully resolved. The original consequences that motivated this work:

- A Redis flush = **permanent loss** of all messages and the entire social graph.
- Message content containing a `.` corrupts on parse (known bug, e.g. `"3.14"`).
- Mutual add/remove does two sequential writes with no `MULTI`, so a mid-write failure leaves the two sides inconsistent.

(Historically, Postgres held only the `users` table + an `fcm_token[]` column; Stages 2–3 moved FCM tokens, friendships, and messages into normalized tables.) The goal is to make the app professional, scalable, and eventually **microservices / Kubernetes-ready**, by putting durable data where it belongs and narrowing Redis to what it's actually good at.

### Current state (what's true today)

| Data                                    | Home today                                              | Correct?                 |
| --------------------------------------- | ------------------------------------------------------- | ------------------------ |
| Users (id, username, passhash, user_id) | Postgres                                                | ✅                       |
| FCM tokens                              | Postgres `fcm_tokens` table + Redis cache-aside         | ✅ (normalized, Stage 2) |
| Presence (`connected` flag)             | Redis hash `user_id:<username>`                         | ✅ ephemeral             |
| Rate-limit counters                     | Redis (TTL keys)                                        | ✅ ephemeral             |
| **Friendships**                         | Postgres `friendships` (canonical row) + Redis presence | ✅ (Stage 2)             |
| **Messages**                            | Postgres `messages` (one row/message, proper columns)   | ✅ (Stage 3)             |

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

### Stage 3 — messages → Postgres ✅ DONE

A `messages` table with proper columns (surrogate `bigserial id` as the pagination cursor + a `message_id` uuid as the stable wire id; `text content` kills the dot-delimiter bug). Each send is now a **single atomic `INSERT`** (replacing the non-transactional dual `lPush`), and remove-friend is a single atomic `DELETE` of the conversation. Data-access is `db/repositories/messages.ts` (`saveMessage`, `getConversation`, `getRecentMessagesForConversations`, `deleteConversation`); the Redis `chat:<user_id>` lists are gone.

- **History + pagination (both directions):** the connect-time load is now **bounded** — the first page of friends (`getFriendsPage`, stable `created_at`-desc order) plus the recent N messages for _only_ that page's conversations (replaces the unbounded `getFriends` + `lRange(0,-1)`). Two new cursor-paginated socket events drive infinite scroll: `LOAD_OLDER` (older messages within a conversation, cursored on `id`) and `LOAD_MORE_FRIENDS` (next friends page, returning that page's recent messages in the ack). Sort-the-friends-list-by-latest-message was scoped out (deferred); friends page in friendship-recency order.
- **FCM decoupled (principle 4):** the send path no longer calls FCM inline. It publishes a `message-sent` event on a Redis pub/sub channel (`${appName}:events:message-sent`); a boot-time subscriber (`utils/events/messageSentSubscriber.ts`) consumes it and sends the push, keeping notification latency/errors off the message critical path and making the notification path the easy first service extraction (Stage 6). See the multi-instance caveat under Stage 5.

### Stage 4 — Dockerize (4a) ✅ + AWS deploy validated (4b) ✅ + Terraform (4c) ✅ DONE

**4a — the image + Compose stack (done).** A root `Dockerfile` (multi-stage, `node:22-bookworm-slim`, Corepack-pinned Yarn 4, `yarn workspaces focus --production`, non-root) and a `docker-compose.yml` with backend + `postgres:16-alpine` + `redis:7-alpine` + a **one-shot `migrate` service** — the Compose stand-in for a k8s Job / one-off ECS task. The frontend stays a static CDN build (Netlify); it is deliberately **not** containerized. CI gained a `docker` job that builds the image and smoke-tests the whole stack against `/health`.

**No compile step:** `common` is consumed as raw TS and the server runs under `tsx` (a runtime dep), so the image ships `.ts` sources — matching the Render deploy. This resolves the "compiled artifacts deferred to Stage 4" question from Stage 1 **in favour of staying on `tsx`**; revisit only if image size or cold start ever justifies it.

Five latent blockers had to be fixed to make the app containerizable at all — each was a bug that only a container (or a load balancer) exposes:

1. **No health endpoint existed.** Added `GET /health` (liveness only, no DB round-trip). An ALB/k8s probe kills a task that cannot answer one, so this is a hard prerequisite for 4b, not a nicety.
2. **`PORT` had no default** — `server.listen(undefined)` bound a _random_ port.
3. **Redis transport was keyed off `NODE_ENV`**, so any non-production process fell back to `redis://localhost:6379` — which _inside a container is the container itself_. Replaced with an explicit **`REDIS_URL`** (→ discrete `REDIS_*` → local default). `NODE_ENV` now means only what it should: CORS strictness. Both test harnesses previously forced `NODE_ENV=production` purely to reach Redis; that hack is gone.
4. **Migrations only ran via `drizzle-kit`**, a devDependency absent from a production image. The programmatic migrator was promoted from `test/runMigrations.ts` to a first-class **`scripts/migrate.ts`** (needs only `drizzle-orm` + `pg` + `tsx`, all runtime deps) and is now shared by Compose, both test harnesses, and — in 4b — a one-off ECS task.
5. **`firebase.ts` `require`d the gitignored `service-account.json` at import time.** Credentials now come **only** from **`FIREBASE_SERVICE_ACCOUNT_JSON`** (raw JSON or base64) — the on-disk fallback was dropped entirely, so no image layer, repo, or working tree holds the credential. A missing value fails fast with an actionable message rather than handing `undefined` to `admin.credential.cert()`.

**4b — AWS deployment, validated end to end ✅ DONE.** The same image ran on **ECR → ECS Fargate behind an ALB, with RDS Postgres, ElastiCache Redis, Secrets Manager, IAM and CloudWatch Logs**: migrations applied by a **one-off ECS task** (the ECS analogue of a k8s Job, reusing `scripts/migrate.ts`), then a real two-user chat driven through a browser against the ALB — messages persisted to RDS and survived a reload. Built by hand in the console first, deliberately, so the resource graph is understood before it is codified. The stack was then **torn down** (it is not a permanent deploy — production stays on Render/Netlify); teardown is part of the design, since the topology costs ~$0.067/hr and there is no free tier.

Design decisions worth keeping:

- **No NAT Gateway** (~$32/mo for nothing at this scale): Fargate tasks run in **public subnets with `assignPublicIp`**, so the ECS agent can reach ECR. The security groups are what protect the task, not private subnets — a documented cost/security trade-off, not an omission.
- **Security groups reference each other by identity, not IP** (ALB → tasks → RDS/ElastiCache). Task IPs are ephemeral; group membership is the only stable thing to write a rule against.
- **Immutable image tags** (`v1`, `v2`, or a git SHA — never `latest`). A mutable tag makes "which build is running?" unanswerable and rollback impossible.
- **The ALB target group must speak HTTP/1.1** — the WebSocket `Upgrade` handshake **does not exist in HTTP/2**, so an h2 target group silently breaks Socket.io's upgrade.
- **The ALB needs session stickiness**, because Socket.io's long-polling upgrade spans several requests that must reach the same backend. Stickiness is a **stopgap**, not a fix: it balances by client rather than by request, and two tasks still cannot deliver to each other's connected users while rooms and presence live in one process's memory. **That constraint is exactly what Stage 5's Redis adapter removes** — encountered from the inside, on real infrastructure.

Two further blockers appeared only against real managed services (neither is reachable locally):

6. **RDS refuses unencrypted connections** (`rds.force_ssl = 1` by default on Postgres 15+), rejecting the pool with `no pg_hba.conf entry for host …, no encryption` — which reads like a _firewall_ problem and sends you debugging the wrong layer. TLS can't simply be switched on everywhere (Compose/Testcontainers Postgres has none), so it became configuration: **`DATABASE_SSL=true`** (+ optional `DATABASE_CA` to verify), resolved once in `db/ssl.ts` and shared by the app pool and the migrator.
7. **A secret stored in the wrong shape crashed the container on boot.** Secrets Manager's "Key/value" tab wraps the value in a JSON object; the app parsed it fine and handed Firebase an object with no `project_id`. Note the _same_ mistake on `JWT_SECRET` would have **failed silently** — any string is a valid HMAC key. Validate the shape of what you load, not merely that you loaded something.

**4c — Terraform ✅ DONE.** The identical stack now exists as committed IaC under [`infra/`](../infra/README.md): `terraform apply` builds all 36 resources from nothing, and `terraform destroy` removes them, repeatably. Verified end to end — migrations applied by a one-off Fargate task (exit 0), then a two-user chat driven through the ALB in two browsers, with messages surviving a reload (i.e. read back from RDS) and a real WebSocket upgrade confirmed rather than a silent long-polling fallback. It also fixes what the console did badly: teardown is now one command in reverse dependency order, not a manual scavenger hunt.

Four decisions worth carrying forward:

- **State is split by lifecycle, not by service.** `infra/bootstrap/` owns the things that must exist _before_ a deployment and outlive it — the ECR repository, the two secret containers, and the S3 state bucket. `infra/` owns everything created and destroyed as a unit, and reads the rest via data sources. Without that split, the first `apply` always fails to pull an image (the registry is created by the same apply that runs the service), and every `destroy` throws away the credentials. The cost is that Terraform can no longer order the two — hence `prevent_destroy` on the state bucket, since destroying bootstrap while the app stack is live orphans every resource in it.
- **Terraform provisions; it does not deploy.** Build → push → `apply` → run the migration task is a _pipeline_, and Terraform is one step in it. The tempting `null_resource` + `local-exec` hack to force that ordering would turn a declarative graph into a shell script with extra steps. The visible consequence: between `apply` and the migration task the service is briefly live against an empty schema (it stays healthy — `/health` does no DB round-trip). Closing that properly means `desired_count = 0` → migrate → scale up, or migrating as a pre-deploy step.
- **Secrets are split by who generates them.** The RDS password is a `random_password` Terraform writes to Secrets Manager — and therefore sits in plaintext in state, which is exactly why state is encrypted, versioned, and never committed. The JWT and Firebase values are created as _empty_ containers and filled out-of-band, so those credentials never enter state at all. The price is honest: `terraform apply` alone does not produce a working stack.
- **The IAM split is the security story.** The _execution_ role (assumed by the ECS agent: pull image, write logs, resolve secrets) can read exactly three secret ARNs — not `*`. The _task_ role (assumed by application code) has no policies at all, because the app talks to Postgres and Redis, not AWS. An empty role states that deliberately; omitting it would just be silence.

Docs: [`infra/README.md`](../infra/README.md) — written as a **deployment guide for a reader**, not a diary.

### Stage 5 — Presence rework + Socket.io Redis adapter (scaling prerequisite)

Move in-memory disconnect timers + single-instance `connected` flag into shared Redis; add the Socket.io Redis pub/sub adapter so any instance/pod delivers to any user's room. Makes the realtime gateway stateless & horizontally scalable.

> **Multi-instance FCM caveat (from Stage 3):** the `message-sent` Redis pub/sub is fan-out — with >1 instance, _every_ instance's subscriber receives each event and would send a **duplicate** push. Correct at a single instance today. When scaling out, give the notification consumer single-delivery semantics (a Redis **Streams consumer group**, or fold it into the extracted Notification service in Stage 6) instead of plain pub/sub.

### Stage 6 — Microservices extraction (future, not scheduled)

Split into: **Auth/Identity**, **Social/Friendship**, **Messaging**, **Realtime Gateway** (thin, stateless, holds sockets), **Notification** (event-driven, easiest first extraction). Replace build-time `common` with versioned/published contracts. Database-per-service.

---

## Deployment targets (reference)

- **Proper way:** stateless app container + **managed Postgres** (Cloud SQL / RDS / Neon) + **managed Redis** (Memorystore / ElastiCache / Upstash) on **Cloud Run / App Runner / Fargate**, graduating to **managed k8s (GKE/EKS/AKS)**. App containers disposable; all state in managed services.
- **Free / scale-to-zero:** **Render** or **Koyeb** free tier (Docker + free Postgres; server cold-starts after ~15 min idle), or **Cloud Run + Neon + Upstash** (best "free but same shape as proper"). Frontend static on Netlify / Cloudflare Pages. _(Fly.io dropped its free tier; Railway ≈ $1/mo credit.)_
- Both scenarios share one shape — stateless container + managed PG + managed Redis — so free → paid needs no re-architecture.
