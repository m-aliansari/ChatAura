import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
vi.mock("./postgres.js", () => ({ pool: { query: (...a) => query(...a) } }));

const { checkUserExists } = await import("./users.js");

beforeEach(() => query.mockReset());

describe("checkUserExists", () => {
    it("returns true when a row is found", async () => {
        query.mockResolvedValue([{ username: "alice" }]);
        expect(await checkUserExists("alice")).toBe(true);
    });

    it("returns false when no row is found", async () => {
        query.mockResolvedValue([]);
        expect(await checkUserExists("ghost")).toBe(false);
    });

    it("returns false (does not throw) when the query misbehaves", async () => {
        // Unexpected result -> `.length` access throws inside the try -> caught.
        query.mockResolvedValue(null);
        await expect(checkUserExists("alice")).resolves.toBe(false);
    });
});
