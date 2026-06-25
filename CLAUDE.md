# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Realtime chat app where users register, add each other as friends, and exchange direct messages over WebSockets. Monorepo managed with **Yarn 4 (Berry) workspaces** under `packages/*`:

- `@realtime-chatapp/client` — React 19 + Vite + Chakra UI v3 frontend
- `@realtime-chatapp/server` — Express 5 + Socket.io backend
- `@realtime-chatapp/common` — shared Yup validation schemas and shared constants (`SOCKET_EVENTS`, `API_ROUTES`, `appName`)

The `common` package is imported by **both** client and server and is the single source of truth for socket event names, API route paths, and form validation. Change an event/route name there, not in a consumer.

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

There is **no test suite** in this repo.

## Architecture

### Auth: JWT, not sessions
Despite `express-session`/`connect-redis` being dependencies, session middleware is commented out. Auth is JWT-based:
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
