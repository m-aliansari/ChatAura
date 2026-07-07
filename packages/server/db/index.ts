import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Single pooled Postgres connection for the whole app (replaces the former pg-promise
// pool). Built from the discrete DATABASE_* env vars so no runtime env change is needed.
const pool = new Pool({
    max: 10,
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
});

// No `schema` passed: the client is intentionally table-agnostic (a pure connection). We use
// the core query builder (`db.select().from(table)`), so each repository supplies its own
// table from its context's schema file — no aggregate schema surface to couple contexts.
export const db = drizzle({ client: pool });
