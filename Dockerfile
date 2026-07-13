# syntax=docker/dockerfile:1
#
# Server image. Built from the REPO ROOT, not packages/server — the server imports
# @realtime-chatapp/common as a Yarn workspace, so the build context must contain both
# packages and the root lockfile.
#
# There is no compile step: `common` is published as raw TypeScript ("main": "index.ts")
# and the server runs under `tsx`, which is a runtime dependency. The image therefore ships
# .ts sources, exactly as the Render deploy does today.

# Debian, not Alpine: `bcrypt` is a native module and ships glibc prebuilds; musl would
# force a source rebuild in the final image.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable
ENV YARN_ENABLE_TELEMETRY=0

# ---- deps: resolve node_modules from the lockfile ----
FROM base AS deps

# Fallback toolchain for node-gyp, used only if bcrypt has no prebuild for this platform.
# Confined to this stage — it never reaches the runtime image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Manifests only, so this layer caches until a dependency actually changes.
# Every workspace manifest is required for Yarn to resolve the workspace graph.
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/common/package.json packages/common/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Production dependencies of the server workspace only — no devDependencies, no client.
# (`tsx` is a server *dependency*, so it survives this; `typescript` and `drizzle-kit` are
# devDependencies and correctly do not.)
RUN yarn workspaces focus @realtime-chatapp/server --production

# ---- runtime ----
FROM base AS runtime

# Brings node_modules (including the workspace symlink for @realtime-chatapp/common)
# and the manifests along with it.
COPY --from=deps /app ./

COPY packages/common ./packages/common
COPY packages/server ./packages/server

USER node
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `node --import tsx` rather than `yarn start`: invoking Yarn here would make Corepack try
# to fetch its pinned release at container start, i.e. a network call on every boot.
CMD ["node", "--import", "tsx", "packages/server/index.ts"]
