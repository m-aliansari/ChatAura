import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolve relative to this file (packages/server/test/) so it works regardless of the
// process cwd (vitest runs from the package; Playwright from the client).
const migrationsFolder = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../drizzle");

/** Applies all Drizzle migrations to the given Postgres connection URI. Shared by the
 *  integration globalSetup and the e2e server bootstrap so both build the full schema. */
export async function runMigrations(connectionUri: string) {
    const pool = new Pool({ connectionString: connectionUri });
    const db = drizzle(pool);
    try {
        await migrate(db, { migrationsFolder });
    } finally {
        await pool.end();
    }
}
