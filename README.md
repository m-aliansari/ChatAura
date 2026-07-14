# ChatAura — Realtime Chat App

[![CI](https://github.com/m-aliansari/ChatAura/actions/workflows/ci.yml/badge.svg)](https://github.com/m-aliansari/ChatAura/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/m-aliansari/ChatAura/branch/master/graph/badge.svg)](https://codecov.io/gh/m-aliansari/ChatAura)

A full-stack, real-time messaging web app where users register, add each other as friends, and exchange direct messages over WebSockets. Includes live presence, typing indicators, and offline web-push notifications so users are alerted to new messages even when the app is closed.

Built as a **Yarn 4 (Berry) workspaces monorepo** with a React frontend, an Express + Socket.io backend, and a shared package that keeps the two in sync.

## Features

- **Real-time direct messaging** between friends over Socket.io, with message persistence and history restored on reconnect.
- **Authentication** — registration and login with bcrypt-hashed passwords and stateless JWTs (3h expiry) that authorize both HTTP requests and the WebSocket handshake.
- **Friends system** — add users by username, with validation against self-adds, non-existent users, and duplicates; friend lists are kept in sync on both sides.
- **Live presence** — friends' online/offline status updates in real time, with a 3-second disconnect grace window so status doesn't flicker on page refresh.
- **Typing indicators** — typing / stop-typing events relayed between participants.
- **Offline push notifications** — Firebase Cloud Messaging web push notifies users of new messages when the app is backgrounded or closed; clicking a notification deep-links into the conversation via a service worker.
- **Rate limiting** — per-IP, Redis-backed limiting on auth endpoints.
- **Light/dark theming** with a responsive Chakra UI interface.

## Screenshots

The full chat interface — friends list with live online (green) / offline (red) presence, and an active conversation:

![Chat interface](docs/screenshots/full-chat-interface-showing-1-online-1-offline.PNG)

Live typing indicator:

![Typing indicator](docs/screenshots/typing-notif.PNG)

## Tech Stack

**Frontend** — React 19, Vite, Chakra UI v3 (Emotion + Framer Motion), React Router v7 (hash routing), Formik + Yup, socket.io-client, Firebase JS SDK (FCM)

**Backend** — TypeScript (run under `tsx`, no build step), Node.js, Express 5, Socket.io, Drizzle ORM, `jsonwebtoken`, bcrypt, Helmet + CORS, firebase-admin, redis

**Data** — PostgreSQL (durable: users, friendships, messages, FCM tokens) · Redis (realtime/ephemeral only: presence, FCM token cache, rate-limit counters, pub/sub)

**Infrastructure** — Docker + Compose, and the AWS deployment (ECS Fargate, ALB, RDS, ElastiCache, ECR, Secrets Manager) as Terraform under [`infra/`](infra/README.md)

## Monorepo layout

```
packages/
  client/   @realtime-chatapp/client  — React + Vite frontend
  server/   @realtime-chatapp/server  — Express + Socket.io backend
  common/   @realtime-chatapp/common  — shared Yup schemas + constants
```

`common` is imported by **both** client and server and is the single source of truth for socket event names, API route paths, and form validation — change an event/route name there, not in a consumer, to avoid client/server drift.

## Architecture highlights

- **Stateless JWT auth across two transports.** The same token authorizes REST calls (`Authorization: Bearer <token>`) and the Socket.io handshake (`handshake.auth.token`). A socket middleware (`authorizeUser`) verifies the JWT before any event is processed and attaches `socket.user`. No server-side sessions.
- **Postgres is the source of truth; Redis is speed, never the only copy.** Users, friendships, messages and FCM tokens are durable relational data in Postgres (via Drizzle); Redis holds only what can be lost — presence, rate-limit counters, the FCM token cache (read-through: Redis first, Postgres fallback, then backfill), and a pub/sub channel that keeps push notifications off the message send path.
- **Bounded loads and cursor pagination.** Connecting fetches the first page of friends plus recent messages for only those conversations — not the whole history. Infinite scroll continues both, cursored on a monotonic id.
- **Room-based routing.** Each user joins a Socket.io room keyed by their user ID, so messages and friend events reach every tab/device they have open.
- **Disconnect grace period.** A 3-second timer delays marking a user offline; a reconnect within the window cancels it, preventing presence flicker on refresh.
- **End-to-end push pipeline.** Service worker registration → token persistence/caching → server dispatch via firebase-admin → notification-click deep-link back into the conversation.

## Getting started

### Prerequisites

- Node.js + Yarn 4 (Berry) — the repo pins `yarn@4.9.2` via `packageManager`
- A PostgreSQL instance and a Redis instance
- (Optional, for push notifications) a Firebase project + service account

### Install

```bash
yarn install
```

### Configure environment

**`packages/server/.env`**

```
PORT=
JWT_SECRET=
NODE_ENV=development
DATABASE_NAME=
DATABASE_HOST=
DATABASE_USER=
DATABASE_PASSWORD=
DATABASE_PORT=
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_SOCKET_HOST=
REDIS_SOCKET_PORT=
CLIENT_BASE_URL=
CLIENT_BASE_URL_DEV=
```

> Remote (authenticated) Redis is used only when `NODE_ENV=production`; in development a local Redis is used. For push notifications, place a Firebase `service-account.json` in `packages/server/` (gitignored).

**`packages/client/.env`** (Vite requires the `VITE_` prefix)

```
VITE_API_BASE_URL=
VITE_FIREBASE_VAPID_KEY=
```

### Set up the database

```bash
yarn workspace @realtime-chatapp/server db:migrate
```

### Run in development

```bash
yarn dev:server   # tsx watch backend
yarn dev:client   # vite dev server
```

Or bring up the whole backend in containers — server + Postgres + Redis + a one-shot migration job:

```bash
docker compose up -d --wait
```

The client is deliberately **not** containerized; it stays a static build served from a CDN. Run it with `yarn dev:client` and point `VITE_API_BASE_URL` at the server.

The client uses **hash routing**, so URLs look like `http://localhost:5173/#/...`.

## Scripts

Run from the repo root:

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `yarn dev:server`   | Start the backend (nodemon)        |
| `yarn dev:client`   | Start the Vite dev server          |
| `yarn build:client` | Production build of the client     |
| `yarn start`        | Run the backend (production entry) |

Per-package:

| Command                                               | Description                                            |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `yarn typecheck`                                      | `tsc --noEmit` for common + server (CI gate)           |
| `yarn workspace @realtime-chatapp/client lint`        | ESLint the client                                      |
| `yarn workspace @realtime-chatapp/server db:generate` | Generate a SQL migration from schema changes (Drizzle) |
| `yarn workspace @realtime-chatapp/server db:migrate`  | Apply pending migrations                               |
| `yarn workspace @realtime-chatapp/server db:seed`     | Seed a dev database (40 friends × 60 messages)         |

### Testing

Three tiers, run from the repo root (integration and E2E need Docker):

| Command                 | Description                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| `yarn test`             | Unit tests (Vitest) across common, server, and client                   |
| `yarn test:integration` | Server integration tests against real Postgres + Redis (Testcontainers) |
| `yarn test:e2e`         | Playwright end-to-end tests across three browsers                       |
| `yarn test:all`         | All of the above, in sequence                                           |
| `yarn coverage:server`  | Merged unit + integration coverage report for the server                |

CI (GitHub Actions) runs lint, a `tsc --noEmit` typecheck, all three test tiers, and a Docker job that builds the image and smoke-tests the full Compose stack — on every pull request and push to `master`. Both production deploys are gated on a green pipeline.

## Deployment

**Production** runs on **Netlify** (client, a static build) and **Render** (server, from the repo root so the `common` workspace resolves at runtime). Both deploys are gated on CI passing.

**AWS**, as Infrastructure as Code, lives in **[`infra/`](infra/README.md)**: the same container image on **ECS Fargate behind an ALB**, with **RDS Postgres**, **ElastiCache Redis**, **ECR**, **Secrets Manager**, IAM and CloudWatch — all defined in Terraform, applied from nothing and destroyed back to nothing. Migrations run as a one-off Fargate task (the ECS analogue of a Kubernetes Job) reusing the same migration script as Compose and the test harnesses.

A few decisions there are load-bearing and easy to get wrong:

- The ALB target group must speak **HTTP/1.1** — the WebSocket `Upgrade` handshake does not exist in HTTP/2, and an h2 target group degrades Socket.io to long-polling _silently_.
- Sticky sessions pin each client to one task, because Socket.io's upgrade spans several requests that must reach the same process. This is a **stopgap, not a fix**: two tasks still cannot deliver to each other's connected users while rooms and presence live in one process's memory. Removing that constraint — the Socket.io Redis adapter — is the next stage of the [roadmap](docs/ROADMAP.md).
- Terraform state is split by lifecycle: the registry and secret containers outlive any deployment, so they sit in their own stack.

## License

MIT
