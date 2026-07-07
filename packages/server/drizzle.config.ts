import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit CLI config (generate / migrate / studio). Reads DATABASE_URL from .env —
// the same connection-string var node-pg-migrate previously used. The app runtime does
// NOT use this file; it connects via the discrete DATABASE_* vars in db/index.ts.
export default defineConfig({
    dialect: "postgresql",
    schema: "./db/schema",
    out: "./drizzle",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
