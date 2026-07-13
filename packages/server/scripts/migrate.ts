import "dotenv/config.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { resolvePgSsl } from "../db/ssl.js";

// Resolve relative to this file (packages/server/scripts/) so it works regardless of the
// process cwd — vitest runs from the package, Playwright from the client, the container
// from /app.
const migrationsFolder = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../drizzle");

/** Applies all Drizzle migrations to the given Postgres connection URI. Shared by the
 *  integration globalSetup, the e2e server bootstrap, and the container/CLI entrypoint
 *  below, so every environment builds the identical schema.
 *
 *  Deliberately uses drizzle-orm's migrator rather than the `drizzle-kit` CLI: drizzle-kit
 *  is a devDependency, so it does not exist in a production image. This needs only
 *  drizzle-orm + pg + tsx, all of which are runtime dependencies. */
export async function runMigrations(connectionUri: string) {
    const pool = new Pool({ connectionString: connectionUri, ssl: resolvePgSsl() });
    const db = drizzle(pool);
    try {
        await migrate(db, { migrationsFolder });
    } finally {
        await pool.end();
    }
}

/** DATABASE_URL if given (drizzle-kit's shape), else assembled from the discrete
 *  DATABASE_* vars the app runtime already uses — so a deployment need only configure
 *  one set of credentials. */
function connectionUriFromEnv(): string {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

    const { DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT, DATABASE_NAME } =
        process.env;

    if (!DATABASE_HOST || !DATABASE_NAME || !DATABASE_USER) {
        throw new Error(
            "Cannot run migrations: set DATABASE_URL, or DATABASE_HOST/PORT/USER/PASSWORD/NAME.",
        );
    }

    const auth = `${encodeURIComponent(DATABASE_USER)}:${encodeURIComponent(DATABASE_PASSWORD ?? "")}`;
    return `postgres://${auth}@${DATABASE_HOST}:${DATABASE_PORT ?? 5432}/${DATABASE_NAME}`;
}

// CLI entrypoint: `tsx scripts/migrate.ts`. Used by the Compose `migrate` service and by a
// one-off ECS task / k8s Job before the app rolls out. No-ops when merely imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await runMigrations(connectionUriFromEnv());
    console.log("Migrations applied.");
}
