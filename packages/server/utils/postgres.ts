import pgp from "pg-promise";

export const pool = pgp()({
    max: 10,
    database: process.env.DATABASE_NAME,
    host: process.env.DATABASE_HOST,
    password: process.env.DATABASE_PASSWORD,
    user: process.env.DATABASE_USER,
    port: Number(process.env.DATABASE_PORT),
});
