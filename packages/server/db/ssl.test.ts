import { describe, it, expect, afterEach, vi } from "vitest";
import { resolvePgSsl } from "./ssl.js";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("resolvePgSsl", () => {
    // Compose and Testcontainers run a plain Postgres with no TLS at all.
    it("is off unless DATABASE_SSL is exactly 'true'", () => {
        vi.stubEnv("DATABASE_SSL", undefined);
        expect(resolvePgSsl()).toBeUndefined();

        vi.stubEnv("DATABASE_SSL", "false");
        expect(resolvePgSsl()).toBeUndefined();

        // Guard against a truthy-but-not-true value silently enabling TLS.
        vi.stubEnv("DATABASE_SSL", "1");
        expect(resolvePgSsl()).toBeUndefined();
    });

    // RDS (rds.force_ssl=1) with no CA bundle shipped: encrypted, unverified.
    it("encrypts without verifying when no CA is supplied", () => {
        vi.stubEnv("DATABASE_SSL", "true");
        vi.stubEnv("DATABASE_CA", undefined);

        expect(resolvePgSsl()).toEqual({ rejectUnauthorized: false });
    });

    it("verifies against DATABASE_CA when one is supplied", () => {
        vi.stubEnv("DATABASE_SSL", "true");
        vi.stubEnv("DATABASE_CA", "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----");

        expect(resolvePgSsl()).toEqual({
            ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
            rejectUnauthorized: true,
        });
    });
});
