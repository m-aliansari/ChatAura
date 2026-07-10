# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Realtime chat app where users register, add each other as friends, and exchange direct messages over WebSockets. Monorepo managed with **Yarn 4 (Berry) workspaces** under `packages/*`:

- `@realtime-chatapp/client` — React 19 + Vite + Chakra UI v3 frontend (JavaScript/JSX)
- `@realtime-chatapp/server` — Express 5 + Socket.io backend (**TypeScript**, run via `tsx`)
- `@realtime-chatapp/common` — shared Yup validation schemas and shared constants (`SOCKET_EVENTS`, `API_ROUTES`, `appName`) (**TypeScript**)

The `common` package is imported by **both** client and server and is the single source of truth for socket event names, API route paths, and form validation. Change an event/route name there, not in a consumer.

## Architectural Direction & Decisions (roadmap)

> **This section is direction, partly implemented.** It records where the app is going and why. **Stages 2–3 are done:** friendships, FCM tokens, **and messages** now live in **Postgres** (via Drizzle). All durable data is in Postgres; Redis is cache + presence + pub/sub only. Full detail, staged plan, and deployment targets live in **[`docs/ROADMAP.md`](docs/ROADMAP.md)**; keep the two in sync.

The overarching goal: make the app professional, scalable, and **microservices / k8s-ready**, by treating Redis correctly and putting durable data in Postgres. Keep these in mind for every change:

**Key decisions:**

- **Redis is not a database.** Narrow it to cache + pub/sub + ephemeral state. Presence (`connected`), FCM cache-aside, and rate-limit TTL keys are already correct — **do not touch them**.
- **Postgres = source of truth** for durable/relational data. **Friendships** and **FCM tokens** (Stage 2) **and messages** (Stage 3) all live in Postgres via Drizzle. No durable data remains in Redis.
- **Adopt TypeScript** — `server` + `common` **done** (run via `tsx`, `tsc --noEmit` CI gate); client (JSX) deferred. See "TypeScript" under Conventions.
- **ORM = Drizzle** (chosen over Prisma/Kysely: lightweight, no engine binary, no lock-in, SQL-shaped, k8s-friendly). **Adopted (Stage 2):** it is the single data-access layer (pg-promise removed) and owns migrations (`drizzle-kit`). All data-access code goes through `db/` (schema, client, repositories).
- **New tables must be normalized** (no 1NF/2NF/3NF/BCNF violations); usernames/labels live in their owning table and are joined, not denormalized. See [`docs/DATABASE_NORMALIZATION.md`](docs/DATABASE_NORMALIZATION.md) for the working reference used when adding tables.
- **Read [`docs/BUG_POSTMORTEMS.md`](docs/BUG_POSTMORTEMS.md) before touching the socket connect path, a pagination cursor, or a user-creation write path.** It records fixed bugs whose _underlying hazard_ still exists — e.g. `index.ts` still registers socket listeners after `await initializeUser`, so nothing may await between that function's last `emit` and its return.
- **Sequencing:** TypeScript (done) → Drizzle + friendships/FCM to Postgres (**done**) → messages to Postgres (**done**) → Docker (next).
- **Microservices posture = Option A: a microservices-_ready_ monolith.** Stay one deployable now; do not physically split services yet (YAGNI).
- **Do not weight the shared `common` package** as an argument in decisions — as a build-time workspace symlink it won't survive a microservices split (it becomes versioned/published contracts).

**Guiding principles for new code:**

1. **Postgres = source of truth; Redis = speed + realtime, never the only copy.** Per Redis key ask: _"if flushed now — cache miss or data loss?"_ Data loss ⇒ it belongs in Postgres.
2. **Database-per-context boundaries.** Keep each domain (auth/users, friendships, messaging) cohesive and separable; cross-context references go through `user_id` (a stable value), **not** hard FKs that straddle future service lines.
3. **Stateless services.** No new per-instance in-memory state — the existing in-memory disconnect timers + single-instance `connected` boolean are the scaling blockers; new realtime coordination goes through shared Redis + (eventually) the Socket.io Redis pub/sub adapter.
4. **Contract-based, loosely coupled.** Prefer decoupling side effects (e.g. emit an event on new message) over direct cross-domain calls, so pieces can split out cleanly later.

## Commands

Run from the repo root (workspace-aware scripts):

```bash
yarn dev:server      # tsx watch server (packages/server)
yarn dev:client      # vite dev server (packages/client)
yarn build:client    # production client build
yarn start           # tsx server (production entry)
yarn typecheck       # tsc --noEmit for common + server (CI gate; tsx does NOT type-check)
```

Client lint (no root script — run in the package):

```bash
yarn workspace @realtime-chatapp/client lint   # eslint .
```

Database migrations (**Drizzle Kit**, SQL migrations generated into `packages/server/drizzle/` from the `db/schema/` files):

```bash
yarn workspace @realtime-chatapp/server db:generate   # generate a migration from schema changes
yarn workspace @realtime-chatapp/server db:migrate    # apply pending migrations
yarn workspace @realtime-chatapp/server db:push       # push schema directly (dev only, no migration file)
yarn workspace @realtime-chatapp/server db:studio     # open Drizzle Studio
```

Edit the relevant `db/schema/<context>.ts` file (one per bounded context; no barrel — consumers import the specific context file directly), run `db:generate` to produce the SQL migration, then `db:migrate` to apply it. `drizzle.config.ts` reads `DATABASE_URL`; the app runtime connects via the discrete `DATABASE_*` vars in `db/index.ts`.

Seeding a dev database (for exercising infinite scroll / pagination by hand):

```bash
yarn workspace @realtime-chatapp/server db:seed           # 40 friends x 60 messages, user "demouser"/"secret1"
yarn workspace @realtime-chatapp/server db:seed --reset   # TRUNCATE all tables first
```

Defaults deliberately exceed both page sizes (`FRIENDS_PAGE_SIZE=15`, `MESSAGES_PAGE_SIZE=30`) so `LOAD_MORE_FRIENDS` and `LOAD_OLDER` both trigger. Tunable via `SEED_FRIENDS` / `SEED_MESSAGES` / `SEED_USERNAME` / `SEED_PASSWORD`; refuses to run when `NODE_ENV=production`. It goes through the real `addUser` / `addFriendship` repositories (so the `user_a_id < user_b_id` canonicalization is the app's own). **Not** `drizzle-seed`: that generates each column independently and infers row-level relationships from foreign keys, which this schema has none of (soft `user_id` refs, per roadmap principle 2) — it cannot produce canonical friendship pairs or directional messages between befriended users.

⚠️ Nothing at the DB level enforces the credential rules (`users.username` is just `varchar(28)` + `UNIQUE`; the password is only ever seen as a bcrypt hash, so `min(6)` is unenforceable there by construction). A write that skips validation can therefore create an account that Postgres accepts but that gets a **422 at login**. The seeder creates users through `services/registerUser.ts` — the same domain operation `/auth/register` uses — so it cannot produce an un-loginable account. Do not make it call `addUser` directly.

### Testing

Three tiers, all run from the repo root:

```bash
yarn test              # unit (Vitest) across common, server, client — no Docker
yarn test:integration  # server integration: real Postgres + Redis via Testcontainers (needs Docker)
yarn test:e2e          # Playwright E2E: builds client, boots disposable PG+Redis+server, 3 browsers (needs Docker)
yarn test:all          # all of the above, in sequence
yarn coverage:server   # merged unit + integration coverage report -> packages/server/coverage/merged
```

- Unit tests live next to their source as `*.test.{js,jsx}`; server integration tests are `test/integration/**/*.int.test.js` (separate `vitest.integration.config.js`, `fileParallelism: false` — they share one container set).
- Coverage is **measured, not enforced** (no failing threshold). E2E is a behavioral gate and does not contribute to coverage numbers.

### Formatting & hooks

- **Prettier** owns formatting (`.prettierrc.json`: 4-space, double quotes, semicolons); **ESLint** owns code quality, with `eslint-config-prettier` last in each config so they don't conflict. `yarn format` / `yarn lint`.
- **Husky pre-commit** runs `lint-staged`, which formats + `eslint --fix`es only staged files. lint-staged uses **per-package** `.lintstagedrc.json` files so each package's flat ESLint config resolves from the right cwd — do not collapse these into one root glob.

## Architecture

### Auth: JWT, not sessions

There is no session middleware; auth is JWT-based:

- `POST /auth/login` and `/auth/register` return `{ loggedIn, token }`. Token is a JWT (3h expiry) signed with `JWT_SECRET`, payload `{ username, user_id, id }`.
- Client stores the token in `localStorage` and sends it as `Authorization: Bearer <token>` on HTTP and as `socket.handshake.auth.token` on the WebSocket.
- Socket connections are gated by the `authorizeUser` middleware (`middlewares/socket/authorizeUser.js`), which verifies the JWT and attaches `socket.user`.
- JWT helpers in `utils/jwt.js` return **Go-style `[err, result]` tuples**, not throws.

### Dual datastore: Postgres (durable) + Redis (realtime/ephemeral)

- **PostgreSQL** (via **Drizzle ORM** + node-postgres `pg` pool, `db/index.ts`) holds the `users`, `fcm_tokens`, `friendships`, and `messages` tables. Schema in `db/schema/*` (one file per bounded context: `users.ts`, `friendships.ts`, `fcmTokens.ts`, `messages.ts` — **no barrel**; each context file is imported directly by the repository that owns it, keeping cross-context dependencies explicit and each slice extractable); typed data-access in `db/repositories/*` (e.g. `users.ts`, `fcmTokens.ts`, `friendships.ts`, `messages.ts`). The Drizzle client (`db/index.ts`) is table-agnostic (no aggregate `schema`); each query supplies its own table. Tables reference each other by the stable `user_id` value with **no cross-context FKs** (per roadmap principle 2). `friendships` stores one **canonical row** per pair (`user_a_id < user_b_id`, enforced by a CHECK); `getFriends` joins `users` for usernames. `messages` stores one **directional** row per message (`bigserial id` pagination cursor + `message_id` uuid wire id, `text content`); `getFriendsPage` paginates friends in a stable `created_at`-desc order (no messages join — sort-by-latest-message is deferred).
- **Redis** (`utils/redis.js`) holds realtime/ephemeral state only (no durable data). Key builders live in `utils/socket/common.js`:
    - `${appName}:user_id:<username>` — hash of `{ user_id, connected }` (presence)
    - `${appName}:rate-limit:<ip>` and `fcm:tokens:<user_id>` (FCM cache-aside; a JSON `string[]` sourced from the `fcm_tokens` table)
    - `${appName}:events:message-sent` — pub/sub channel decoupling FCM from the send path (see FCM below). The old `chat:<user_id>` message lists are **gone** (messages moved to Postgres in Stage 3).
- Redis client switches between local (dev) and authenticated remote (when `NODE_ENV=production`).

### Socket.io lifecycle (`server/index.js`)

1. `authorizeUser` verifies JWT before connection.
2. On `connection`, `initializeUser` joins the socket to a room named after `user.user_id`, marks the user `connected` in Redis, broadcasts presence to **all** friends, and emits `FRIENDS_LIST` **as `{ friends, hasMore, cursor }`** (the first page from `getFriendsPage`, presence-enriched) + `MESSAGES` (the recent N per conversation for **only that first page's** friends, from Postgres). Both loads are **bounded** — not the whole friend list / whole chat history.
3. Direct messages and friend adds are emitted to the recipient's `user_id` room (`socket.to(user_id).emit(...)`), so a user receives events on any device/tab.
4. **Disconnect grace period:** on `disconnecting`, a 3s timer (`disconnectTimers` map in `constants/socket.js`) delays marking the user offline; a reconnect within the window cancels it. This prevents flicker on refresh.
5. **Pagination (infinite scroll):** two ack-based events continue the bounded loads — `LOAD_OLDER` (`{ friendUserId, before }` → older messages in a conversation, cursored on the numeric `id`) and `LOAD_MORE_FRIENDS` (`{ cursor }` → next friends page **plus** that page's recent messages in the ack). Client handlers: message pagination in `ChatMessages.jsx`, friends pagination in `FriendList/SideBar.jsx`; both merge via `client/src/utils/mergeMessages.js` (dedupe by `messageId`, sort by `id` desc).

### Message storage & wire format

Messages live in the Postgres `messages` table (Stage 3) — the old Redis dot-joined `"messageId.to.from.content"` lists are gone, so `content` round-trips losslessly (dots included). A send is a single atomic `INSERT` (`saveMessage`); removing a friend deletes the whole conversation in one atomic `DELETE` (`deleteConversation`). On the wire (and to the client) a message is the object `{ id, messageId, to, from, content, createdAt }` — `id` (bigserial) is the pagination cursor, the client dedupes on `messageId`. Repository: `db/repositories/messages.ts` (`saveMessage`, `getConversation`, `getRecentMessagesForConversations`, `deleteConversation`); the row→wire mapper `toWireMessage` and page-size constants live in `utils/socket/common.ts`.

### FCM push notifications (decoupled)

FCM is **decoupled from the send path** (roadmap principle 4): `directMessage` publishes a `message-sent` event to the Redis channel `${appName}:events:message-sent` instead of calling FCM inline. A boot-time subscriber (`utils/events/messageSentSubscriber.ts`, started from `index.ts` on a duplicated Redis connection) consumes it and sends the push via `firebase-admin` (`utils/fcm.js`, initialized in `firebase.js`; requires the gitignored `packages/server/service-account.json`). ⚠️ The pub/sub is fan-out — at **>1 instance** every subscriber fires, duplicating notifications; single-instance only until the Stage 5/6 single-consumer rework. Tokens are persisted in the Postgres `fcm_tokens` table (one row per `(user_id, token)`) and cached in Redis as a JSON `string[]`; `fcm_tokens` has **no FK** to `users`, so an authenticated token-save succeeds even for a since-deleted user (the JWT is the gate). The client registers a service worker (`packages/client/public/firebase-messaging-sw.js`) and posts `OPEN_CHAT` messages back to the app to deep-link into a conversation.

### Client structure

- Entry: `main.jsx` wraps the app in `HashRouter` (note: hash routing, so URLs use `#/...`) and the Chakra `Provider`.
- **Nested context providers** (outer → inner): `UserContextProvider` (App-level) → `SocketContextProvide` → `FriendsContextProvider` → `MessagesContextProvider`, mounted only on the authenticated `/home` route in `Views.jsx`. Each context lives in `contexts/<Name>/` split into a `*Context.js` (the `createContext`) and a `*ContextProvider.jsx`. Note the Socket provider file is misspelled on disk as `SocketContextProvide.jsx` (no trailing "r") and is imported under that name — do not "fix" the spelling without updating imports.
- The socket instance is created in `utils/socket.js` with `autoConnect: false`; `useSocketSetup.jsx` calls `socket.connect()` and registers/cleans up all event listeners.
- `UserContextProvider` bootstraps auth on load by GETting `/auth/login` with the stored token; a failure clears the token and sets `loggedIn: false`.
- Chakra UI v3 snippet components (color-mode, provider, toaster, tooltip) live in `components/ui/` — these are generated Chakra snippets, not hand-written app code.

## Environment variables

Server (`packages/server/.env`): `PORT`, `JWT_SECRET`, `NODE_ENV`, `DATABASE_{NAME,HOST,USER,PASSWORD,PORT}`, `REDIS_{USERNAME,PASSWORD,SOCKET_HOST,SOCKET_PORT}` (remote Redis used only when `NODE_ENV=production`), `CLIENT_BASE_URL` / `CLIENT_BASE_URL_DEV`.

Client (Vite, `VITE_` prefix required): `VITE_API_BASE_URL`, `VITE_FIREBASE_VAPID_KEY`.

## Conventions

- ES modules everywhere (`"type": "module"`). Relative imports use explicit extensions — and **TypeScript source keeps `.js` specifiers even though the files are `.ts`** (e.g. `import { db } from "../index.js"` in `db/repositories/users.ts`); `moduleResolution: NodeNext` and `tsx` both resolve `.js`→`.ts`. Do not rewrite these to `.ts`.
- **TypeScript (server + common):** run via `tsx` (no build step, no `dist/`); type safety is a `tsc --noEmit` gate (`yarn typecheck`), not the runtime — `tsx`/esbuild strip types without checking. Config: root `tsconfig.base.json` (`strict`, `NodeNext`, `verbatimModuleSyntax`, `isolatedModules`) + per-package `tsconfig.json`. The type gate covers the **whole package including tests** (`exclude` is only `node_modules`/`coverage`), so `yarn typecheck` and the editor agree. Test mocks use `as unknown as Socket`/`Request`/`Response` casts; integration tests share Testcontainers config via a vitest `ProvidedContext` augmentation (`test/integration/vitest-context.d.ts`). ESLint flat configs set `parserOptions.tsconfigRootDir: import.meta.dirname` so editors don't fail with "No tsconfigRootDir was set" across the monorepo's multiple tsconfigs. `socket.user` is a `declare module "socket.io"` augmentation in `packages/server/types/socket.ts` (`AuthedUser`); `common` exports its entry as `./index.ts` (Vite and `tsx` both transpile it, so the JS client is unaffected).
- Server is layered: `routers/` → `controllers/<feature>Controller/` → `services/` (domain operations) → `db/repositories/` (typed Drizzle data-access) and `utils/`. Table definitions live in `db/schema/` (one file per bounded context), the pooled Drizzle client in `db/index.ts`; there are **no** raw SQL-string modules. Route handlers live in per-feature controller folders.
- **Domain rules belong in `services/`, not in middleware.** `validateForm` guards HTTP _requests_; it cannot guard a seeder, CLI, or queue consumer that writes straight through a repository. So the preconditions for an operation live with the operation: `services/registerUser.ts` validates against `authFormSchema`, checks uniqueness, hashes, and inserts — and both `handleRegister` and `scripts/seed.ts` call it. Repositories (`addUser`) stay dumb data-access primitives. Keep `validateForm` on the route too: enforcing at several boundaries is good, **defining the rule twice is not** — both read the same `authFormSchema` from `common`. Services return a result union (`{ ok: true, … } | { ok: false, reason, … }`) rather than throwing, so callers map outcomes onto their own transport.
- Express routes are mounted under base paths from `API_ROUTES` (e.g. `app.use(API_ROUTES.AUTH.BASE, authRouter)`), and routers use the `SPECIFIC` sub-paths.
- Rate limiting is per-IP via Redis (`middlewares/express/rateLimiter.js`), applied as `rateLimiter(seconds, max)` on auth routes.

## CI & Deployment

CI (`.github/workflows/ci.yml`) runs lint + **typecheck** (both in the `lint` job) + all three test tiers on every PR and push to `master`. The two production deploys are **both gated on that CI passing**, but by different mechanisms:

- **Client → Netlify** (static). The client build **bundles `@realtime-chatapp/common` in at build time**, so Netlify has no runtime dependency on the workspace. `packages/client/netlify.toml` carries an `ignore` command that **builds only Deploy Previews** (PRs: `PULL_REQUEST=true`) and cancels production/branch builds; the live site is published by a GitHub Actions **build hook** (`NETLIFY_BUILD_HOOK` secret) that fires only after CI is green. Build-hook builds bypass the ignore command, so the gated production deploy still works. Do not enable Netlify's "Stopped builds" toggle — it also disables build hooks.
- **Server → Render** (Node, **not bundled**). The server resolves `@realtime-chatapp/common` from `node_modules` **at runtime**, and that package is not published to npm — it exists only as a workspace. So Render **must install from the repo root**: Root Directory is blank, Build Command is `corepack enable && yarn` (Yarn 4 workspace install that symlinks `common` and hoists `yup`), Start Command is `yarn start` (which now runs `tsx index.ts` — `tsx` is a server runtime dependency, and `common` is imported as TS source that `tsx` transpiles at runtime, so there is still no build step and **these deploy commands are unchanged by the TypeScript migration**). If Root Directory were set to `packages/server`, the isolated install would fail to find `common@1.0.0`. Render's **Auto-Deploy = "After CI Checks Pass"** provides the gate natively (no deploy hook needed). DB migrations are **not** auto-applied on deploy — add `yarn workspace @realtime-chatapp/server db:migrate` (Drizzle Kit) to Render's Pre-Deploy command if/when migrations must run before boot.
