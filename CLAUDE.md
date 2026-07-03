# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Realtime chat app where users register, add each other as friends, and exchange direct messages over WebSockets. Monorepo managed with **Yarn 4 (Berry) workspaces** under `packages/*`:

- `@realtime-chatapp/client` — React 19 + Vite + Chakra UI v3 frontend
- `@realtime-chatapp/server` — Express 5 + Socket.io backend
- `@realtime-chatapp/common` — shared Yup validation schemas and shared constants (`SOCKET_EVENTS`, `API_ROUTES`, `appName`)

The `common` package is imported by **both** client and server and is the single source of truth for socket event names, API route paths, and form validation. Change an event/route name there, not in a consumer.

## Architectural Direction & Decisions (roadmap)

> **This section is direction, mostly not-yet-implemented.** It records where the app is going and why. Do NOT read it as current behavior — today messages and friendships still live **only in Redis**. Full detail, staged plan, and deployment targets live in **[`docs/ROADMAP.md`](docs/ROADMAP.md)**; keep the two in sync.

The overarching goal: make the app professional, scalable, and **microservices / k8s-ready**, by treating Redis correctly and putting durable data in Postgres. Keep these in mind for every change:

**Key decisions:**

- **Redis is not a database.** Narrow it to cache + pub/sub + ephemeral state. Presence (`connected`), FCM cache-aside, and rate-limit TTL keys are already correct — **do not touch them**.
- **Postgres = source of truth** for durable/relational data. **Messages and friendships** are currently misplaced in Redis and will move to Postgres.
- **Adopt TypeScript** — `server` + `common` first, client (JSX) deferred.
- **ORM = Drizzle** (chosen over Prisma/Kysely: lightweight, no engine binary, no lock-in, SQL-shaped, k8s-friendly). Standardize new data-access code on it.
- **Sequencing:** TypeScript first, _then_ Drizzle + the Postgres data migration. First data slice = **friendships** (clean cutover, no backfill), then messages, then Docker.
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
yarn dev:server      # nodemon server (packages/server)
yarn dev:client      # vite dev server (packages/client)
yarn build:client    # production client build
yarn start           # node server (production entry)
```

Client lint (no root script — run in the package):

```bash
yarn workspace @realtime-chatapp/client lint   # eslint .
```

Database migrations (node-pg-migrate, SQL files in `packages/server/migrations/`):

```bash
yarn workspace @realtime-chatapp/server migrate:up
yarn workspace @realtime-chatapp/server migrate:down
yarn workspace @realtime-chatapp/server migrate:redo     # down then up the last migration
yarn workspace @realtime-chatapp/server migrate:create <name>
```

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

- **PostgreSQL** (via `pg-promise`, `utils/postgres.js`) holds the `users` table and FCM tokens. Note `pool.query(...)` returns an **array of rows directly** (e.g. `result[0]`), not a `{ rows }` object.
- **Redis** (`utils/redis.js`) holds all realtime state. Key builders live in `utils/socket/common.js`:
    - `${appName}:user_id:<username>` — hash of `{ user_id, connected }`
    - `${appName}:friends:<username>` — list of `"<username>.<user_id>"` entries
    - `${appName}:chat:<user_id>` — list of messages (see format below)
    - `${appName}:rate-limit:<ip>` and `fcm:tokens:<user_id>` (FCM cache)
- Redis client switches between local (dev) and authenticated remote (when `NODE_ENV=production`).

### Socket.io lifecycle (`server/index.js`)

1. `authorizeUser` verifies JWT before connection.
2. On `connection`, `initializeUser` joins the socket to a room named after `user.user_id`, marks the user `connected` in Redis, and emits `FRIENDS_LIST` + persisted `MESSAGES`.
3. Direct messages and friend adds are emitted to the recipient's `user_id` room (`socket.to(user_id).emit(...)`), so a user receives events on any device/tab.
4. **Disconnect grace period:** on `disconnecting`, a 3s timer (`disconnectTimers` map in `constants/socket.js`) delays marking the user offline; a reconnect within the window cancels it. This prevents flicker on refresh.

### Message storage format

Messages are stored as **dot-joined strings**: `"messageId.to.from.content"`, pushed to the Redis chat lists of **both** sender and receiver, and parsed back via `split(".")`. Because of this, message `content` must not be relied upon to round-trip if it contains `.` — keep this in mind before changing the delimiter or message shape.

### FCM push notifications

`firebase-admin` sends web-push notifications on new messages (`utils/fcm.js`, initialized in `firebase.js`). Requires `packages/server/service-account.json` (gitignored). Tokens are persisted in Postgres and cached in Redis. The client registers a service worker (`packages/client/public/firebase-messaging-sw.js`) and posts `OPEN_CHAT` messages back to the app to deep-link into a conversation.

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

- ES modules everywhere (`"type": "module"`). Use `.js`/`.jsx` extensions in relative imports.
- Server is layered: `routers/` → `controllers/<feature>Controller/` → `utils/` and `queries/`. SQL strings live in `queries/`, route handlers in per-feature controller folders.
- Express routes are mounted under base paths from `API_ROUTES` (e.g. `app.use(API_ROUTES.AUTH.BASE, authRouter)`), and routers use the `SPECIFIC` sub-paths.
- Rate limiting is per-IP via Redis (`middlewares/express/rateLimiter.js`), applied as `rateLimiter(seconds, max)` on auth routes.

## CI & Deployment

CI (`.github/workflows/ci.yml`) runs lint + all three test tiers on every PR and push to `master`. The two production deploys are **both gated on that CI passing**, but by different mechanisms:

- **Client → Netlify** (static). The client build **bundles `@realtime-chatapp/common` in at build time**, so Netlify has no runtime dependency on the workspace. `packages/client/netlify.toml` carries an `ignore` command that **builds only Deploy Previews** (PRs: `PULL_REQUEST=true`) and cancels production/branch builds; the live site is published by a GitHub Actions **build hook** (`NETLIFY_BUILD_HOOK` secret) that fires only after CI is green. Build-hook builds bypass the ignore command, so the gated production deploy still works. Do not enable Netlify's "Stopped builds" toggle — it also disables build hooks.
- **Server → Render** (Node, **not bundled**). The server resolves `@realtime-chatapp/common` from `node_modules` **at runtime**, and that package is not published to npm — it exists only as a workspace. So Render **must install from the repo root**: Root Directory is blank, Build Command is `corepack enable && yarn` (Yarn 4 workspace install that symlinks `common` and hoists `yup`), Start Command is `yarn start`. If Root Directory were set to `packages/server`, the isolated install would fail to find `common@1.0.0`. Render's **Auto-Deploy = "After CI Checks Pass"** provides the gate natively (no deploy hook needed). DB migrations are **not** auto-applied on deploy — add `yarn workspace @realtime-chatapp/server migrate:up` to Render's Pre-Deploy command if/when migrations must run before boot.
