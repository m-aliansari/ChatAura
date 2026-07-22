import { describe, it, expect } from "vitest";
import { avatarColor } from "./avatarColor.js";

describe("avatarColor", () => {
    it("is deterministic — the same id always yields the same palette", () => {
        expect(avatarColor("user-123")).toBe(avatarColor("user-123"));
    });

    it("distinguishes different users", () => {
        // Not a guarantee for any two ids (the palette is finite), but these must not collide or
        // the fixture below stops proving anything.
        expect(avatarColor("alice-id")).not.toBe(avatarColor("bob-id"));
    });

    it("always returns a usable Chakra palette name", () => {
        const ids = ["a", "bob-id", "", "9f8e7d6c-1234-4321-abcd-000000000000", "ẞünïcødé"];
        for (const id of ids) {
            expect(avatarColor(id)).toMatch(/^[a-z]+$/);
        }
    });

    it("handles a missing id without throwing", () => {
        expect(() => avatarColor(undefined)).not.toThrow();
        expect(avatarColor(undefined)).toMatch(/^[a-z]+$/);
    });

    it("stays in range for long ids, where the hash overflows int32", () => {
        // `| 0` can produce a negative hash; a missing Math.abs would index off the end and
        // return undefined.
        expect(avatarColor("x".repeat(500))).toMatch(/^[a-z]+$/);
    });
});
