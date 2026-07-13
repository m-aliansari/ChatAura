import type { PoolConfig } from "pg";

/**
 * Managed Postgres refuses unencrypted connections: RDS sets `rds.force_ssl = 1` by default
 * on Postgres 15+, and a plain connection is rejected with `no pg_hba.conf entry for host …,
 * no encryption` — which reads like a firewall problem and sends you debugging the wrong
 * thing. A local Postgres (Compose, Testcontainers) has no TLS at all, so this cannot simply
 * be switched on everywhere; it is configuration.
 *
 * `DATABASE_SSL=true` encrypts the connection. Verification of the server certificate is off
 * unless a CA is supplied in `DATABASE_CA` (PEM): RDS presents a certificate signed by an
 * Amazon CA that is not in Node's default trust store, so verifying requires shipping the RDS
 * CA bundle. Traffic here never leaves the VPC, so the exposure of not verifying is limited
 * to an attacker who is already inside it — but supply DATABASE_CA if you want the real
 * guarantee rather than mere encryption.
 */
export function resolvePgSsl(): PoolConfig["ssl"] {
    if (process.env.DATABASE_SSL !== "true") return undefined;

    const ca = process.env.DATABASE_CA;
    return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}
