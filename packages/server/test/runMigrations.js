import pgPromise from "pg-promise"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const MIGRATION_FILES = [
    "0001_create-initial-tables.sql",
    "0002_add-fcm-field.sql",
]

// Resolve relative to this file (packages/server/test/) so it works regardless
// of the process cwd (vitest runs from the package; Playwright from the client).
const migrationsDir = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../migrations"
)

/** Applies the Up portion of each migration to the given Postgres connection URI. */
export async function runMigrations(connectionUri) {
    const pgp = pgPromise()
    const db = pgp(connectionUri)
    try {
        for (const file of MIGRATION_FILES) {
            const sql = readFileSync(path.join(migrationsDir, file), "utf8")
            const up = sql.split("-- Down Migration")[0]
            await db.none(up)
        }
    } finally {
        await pgp.end()
    }
}
