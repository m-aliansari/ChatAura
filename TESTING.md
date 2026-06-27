# Testing

The suite follows a four-tier strategy (Testing Trophy / Google size model):
static analysis → small (unit) → medium (integration, real services) → large
(E2E). Real Postgres + Redis are used wherever a datastore is involved; mocks
are reserved for genuinely isolated logic and for the one boundary we don't own
(Google FCM).

## Philosophy: tests encode the spec, not the code

Tests assert the behavior the system **should** have. Where the code violates the
spec, the test **fails on purpose** — a red test is a truthful report of a real
bug, not something to silence. We do **not** write tests to match current
(buggy) behavior. Consequently the suite is **intentionally partly red**: green
tests prove the logic meets spec; the failing tests are the **bug backlog** (see
the end of this doc). Do not "fix" a failing test by weakening it — fix the code,
in a separate, deliberate pass.

## Commands

Run from the repo root:

```bash
yarn lint              # static gate (ESLint, client)
yarn test              # small/unit tier across all packages — NO Docker needed (80 tests)
yarn test:integration  # medium tier (server, Testcontainers) — needs Docker   (19 tests)
yarn test:e2e          # large tier (Playwright) — needs Docker (builds client first)
yarn test:all          # everything
```

Current totals: **203 tests — 165 passing, 38 failing (the bug backlog)**.
By tier: common 24✓/16✗ · server unit 49✓/4✗ · client 50✓/7✗ · integration
38✓/11✗ · E2E 4✓. First `test:integration` / `test:e2e` run pulls the `postgres:16-alpine`
/ `redis:7-alpine` images (slow once); subsequent integration runs are ~60s and
E2E ~25s. **A non-zero exit from `yarn test` is expected** while the backlog
stands.

Test-only seams (env-gated, production-safe): `DISABLE_FCM`, `DISCONNECT_GRACE_MS`,
`DISABLE_RATE_LIMIT` (E2E only — many requests share one IP).

Per package:

```bash
yarn workspace @realtime-chatapp/common test
yarn workspace @realtime-chatapp/server test
yarn workspace @realtime-chatapp/client test
yarn workspace @realtime-chatapp/client test:watch   # watch mode
```

## Tier 1–2 — Static + Small (done, no Docker)

Runs in ~seconds, no infrastructure. Covers:

- **common** — Yup schemas (`authFormSchema`, `friendFormSchema`,
  `messageFormSchema`), `SOCKET_EVENTS` / `API_ROUTES` invariants.
- **server (unit)** — `utils/jwt.js` tuple contract, `utils/socket/common.js`
  key builders + `parseFriendList`, the dot-joined message wire format
  (incl. the known `.`-in-content corruption), `rateLimiter` threshold/error
  paths (redis mocked).
- **client** — `usePrevious`, `useAuth`, `getSocketCon`, `TextField`, the
  Login/Signup forms (fetch + navigate mocked), and `useSocketSetup`'s socket
  wiring/reducers.
- **service worker (Layer C)** — `public/firebase-messaging-sw.js` loaded into a
  sandbox: `onBackgroundMessage` payload mapping + dedup, and `notificationclick`
  focus/`OPEN_CHAT` vs `openWindow` routing.

Notification coverage by layer:

| Layer | What | Where | Status |
|-------|------|-------|--------|
| A | FCM token store/get/delete | `utils/fcm.js` + real PG/Redis | **done** |
| B | Send decision + payload | `handleDirectMessage`, mock `admin.messaging().send` | **done** |
| C | Service-worker display/click | `firebase-messaging-sw.js` | **done** |
| D | Real Google→OS delivery | manual | `docs/notification-smoke-test.md` |

### Known failing — bug backlog (12 tests)

These spec tests fail because the code is wrong. Each names a real bug to fix in
a later pass. **Fix the code, then the test goes green — never weaken the test.**

| # | Bug | Failing test(s) |
|---|-----|-----------------|
| 1 | **Dot-delimiter corrupts data.** A `.` in a username or message content breaks `split('.')`, dropping/garbling fields. | `common.test.js` (parseFriendList) · `socket.int.test.js` (message round-trip) |
| 2 | **Duplicate-friend detection never triggers.** Guard compares the bare username to `"name.id"` entries → re-adding a friend duplicates it. Fix: compare `` `${username}.${friend.user_id}` ``. | `handleSocketAddFriend.test.js` |
| 3 | **`handleCheckLogin` double-sends.** Missing `return` on the "user deleted" branch → sends `loggedIn:false` then `loggedIn:true` (real Express: "headers already sent"). | `handleCheckLogin.test.js` |
| 4 | **Client forms crash on a non-responding server.** `Login`/`Signup` set an Error object as state and render it (React throws on object children) → error boundary. | `Auth/Login`, `Auth/Signup` (network case) |
| 5 | **Client forms give no feedback on a 5xx.** Non-ok response returns silently — no message shown. | `Auth/Login`, `Auth/Signup` (5xx case) |
| 6 | **Multi-device notifications dropped.** `sendChatNotifications` only sends to `fcmTokens[0]`; other devices get nothing. | `fcm.int.test.js` (all-tokens) |
| 7 | **`handleRegister` has no error handling.** A DB failure becomes an ungraceful unhandled 500 (unlike `handleLogin`). | `auth-resilience.int.test.js` (register DB-down) |
| 8 | **`getFcmTokens` returns inconsistent shapes.** Cache hit → `['tok']` vs cache miss → `{ fcm_token: ['tok'] }` (raw row), and `undefined` for a user with no row. On a cold cache the caller's `fcmTokens.length > 0` silently skips notifications. Fix: `result[0]?.fcm_token ?? []`. | `fcm.int.test.js` (cache-miss, empty-array) |

No production fixes are kept — all were reverted per the spec-first decision;
fixing is a separate, later pass tracked by the failing tests above.

## Adversarial / abuse coverage (Phase 4)

A severe layer probing every abuse/loophole/abnormal input, organized by threat
category. **Spec assumptions** the tests assert as correct: inputs are trimmed
and non-empty; usernames reject control/NUL/zero-width chars and the `:`/`.`
delimiters and are case-insensitively unique; messages have a server-side length
cap and round-trip losslessly; DMs require friendship and a server-authoritative
`from`; JWTs with `alg:none`/tampered/expired/missing-claims are rejected; a
token for a deleted user cannot connect; malformed/oversized HTTP is handled
gracefully.

### Verified SAFE (these adversarial tests pass — no weakness)
- **XSS** — message content & usernames render as inert text (React escapes);
  no element injected. (`Chat/xss.adversarial`)
- **SQL injection** — parameterized queries store payloads literally; table
  intact. (`http-abuse.int`)
- **JWT forgery** — `alg:none`, tampered signature, wrong secret, and expired
  tokens are all rejected. (`authorizeUser.adversarial`)
- **Spoofed `from`** ignored; **room isolation** holds (no leak to a third
  party). (`abuse.int`)
- **Protocol** — malformed JSON → 4xx, body > 100kb → 413, odd `Authorization`
  → unauthenticated, unknown route → 404. (`http-abuse.int`)
- **Duplicate `messageId`** deduped. (`ChatMessages`)

### New backlog from this phase (grouped by threat)
| Threat | Bug | Where |
|--------|-----|-------|
| Input validation | No trimming; whitespace-only username/password/message accepted | `common/index.adversarial`, `ChatBox`, `Login`, `http-abuse.int` |
| Input validation | Control / NUL / zero-width / RTL chars accepted in usernames | `common/index.adversarial` |
| Input validation | Non-string inputs (number/object) silently coerced to strings | `common/index.adversarial` |
| Injection | `:` and `.` accepted in usernames (Redis-key / delimiter injection) | `common/index.adversarial` |
| Broken authN | Validly-signed token with **no identity claims** is accepted | `authorizeUser.adversarial` |
| Broken authN | Token for a **deleted/non-existent user** connects (no DB check) | `abuse.int` |
| Broken authZ | **DM to a non-friend** is allowed and persisted | `abuse.int` |
| Broken authZ | **DM to a non-existent user** is persisted | `abuse.int` |
| Rate limiting | Per-IP key is **shared across routes** — one route can exhaust another | `http-abuse.int` |
| Data integrity | `username` is `VARCHAR(20)` but the schema allows **28** → 21–28 char names crash the insert (ungraceful 500) | `http-abuse.int` |
| Robustness | App crashes when `localStorage` is disabled (private mode) | `UserContextProvider.adversarial` |

## Tier 3–4 — Medium + Large (implemented; require Docker)

Both tiers are implemented and require **Docker Desktop + WSL2** running
(integration: 49 tests, 11 in the backlog; E2E: 4 tests, all green).

### Prerequisites discovered while scaffolding

1. **Firebase boot seam (done).** `firebase.js` now exports a no-op admin stub
   when `DISABLE_FCM=true`, so the real server boots in E2E/CI without
   `service-account.json`. Integration unit-style tests still `vi.mock`
   `firebase.js` to spy on `admin.messaging().send` (Layer B).
2. **Redis singleton wiring.** `utils/redis.js` uses a hardcoded `createClient()`
   in dev (no URL). To point it at a Testcontainers Redis, either map the
   container to `localhost:6379` or run with `NODE_ENV=production` +
   `REDIS_SOCKET_HOST`/`REDIS_SOCKET_PORT` set from the container (no auth on the
   stock image). Consider a small test-only seam (a `REDIS_URL` override) if the
   mapping proves awkward.
3. **Postgres singleton.** `utils/postgres.js` reads `DATABASE_*` env at import,
   so set those from the container **before** importing it.
4. **Migrations.** Apply `packages/server/migrations/*.sql` (Up portion, before
   the `-- Down Migration` marker) to the fresh container so schema + queries are
   validated together. `users(id serial pk, username unique, passhash, user_id
   unique, fcm_token varchar[] )`.
5. **Test-only seams to add:** injectable disconnect timeout (hardcoded 3s in
   `index.js` / `constants/socket.js`) and a lower bcrypt cost via env in the
   auth controllers (cost 10 is ~50–100ms/call).

### Medium tier plan (`packages/server/test/integration/*.int.test.js`)

- Testcontainers global setup: start PG + Redis, set env, run migrations.
- Auth controllers via native `fetch` against the booted Express app: register
  (dup username → `UNIQUE` violation → "Username taken"), login (bad password),
  `handleCheckLogin`.
- Socket.io lifecycle (real `socket.io` + `socket.io-client`): `authorizeUser`
  accept/reject; `initializeUser` room join + `connected` + `FRIENDS_LIST`/
  `MESSAGES` emits; `handleDirectMessage` persists to both chat lists + emits;
  add/remove friend; disconnect grace period (use the injectable short timeout).
- FCM Layer A: `storeFcmToken`/`getFcmTokens`/`deleteFcmToken` against real
  PG+Redis (covers the `result[0].fcm_token` shape + cache invalidation).
- FCM Layer B: `handleDirectMessage` calls `send` once with the right payload
  when tokens exist; not at all when none.

Config: `vitest.integration.config.js` (separate include glob for
`**/*.int.test.js`), wired to `yarn test:integration`.

### Large tier (`packages/client/e2e/chat.spec.js`) — implemented

- `playwright.config.js` boots two `webServer`s: the E2E backend bootstrap
  (`packages/server/test/e2e/server.mjs` — starts Testcontainers PG+Redis, runs
  migrations, boots the real `index.js` with `DISABLE_FCM=true`) on port 4000,
  and `vite preview` on 4011. `test:e2e` builds the client first (the build
  bakes in `VITE_API_BASE_URL=http://localhost:4000`).
- Journeys (two browser contexts = two users): register → reach authenticated
  home (full-stack smoke); and userA adds userB → B appears in A's list AND A
  appears in B's list **in realtime** (the `FRIEND_ADDED` socket round-trip).

Possible extensions (not yet built): live message send via the chat UI (message
delivery is already covered at the integration tier in `socket.int.test.js`),
disconnect/reconnect grace-period (needs the injectable-timeout seam), and the
SW synthetic-push notification E2E.

## Follow-ups (out of scope here)

- **CI** — a GitHub Actions workflow running the same scripts (lint + test +
  test:integration with Docker services + test:e2e) on push/PR. No test changes.
- **App containerization** — Dockerfiles + dev/prod compose; this suite then
  acts as the safety net, and the E2E `webServer` repoints at that stack.
