import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { friendships } from "../../db/schema/friendships.js";
import {
    addFriendship,
    areFriends,
    getFriends,
    getFriendsPage,
    removeFriendship,
} from "../../db/repositories/friendships.js";
import { insertUser } from "./helpers.js";

const countRows = async () => {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(friendships);
    return row.n;
};

describe("friendships repository (integration)", () => {
    it("creates one canonical row and is mutual, regardless of argument order", async () => {
        const alice = await insertUser();
        const bob = await insertUser();

        const { added } = await addFriendship(bob.user_id, alice.user_id); // reversed order
        expect(added).toBe(true);
        expect(await countRows()).toBe(1);

        expect(await areFriends(alice.user_id, bob.user_id)).toBe(true);
        expect(await areFriends(bob.user_id, alice.user_id)).toBe(true);
    });

    it("is idempotent: a duplicate (or reversed) add never creates a second row", async () => {
        const alice = await insertUser();
        const bob = await insertUser();

        expect((await addFriendship(alice.user_id, bob.user_id)).added).toBe(true);
        expect((await addFriendship(alice.user_id, bob.user_id)).added).toBe(false);
        expect((await addFriendship(bob.user_id, alice.user_id)).added).toBe(false);

        // Both orderings collapsed onto the single canonical row.
        expect(await countRows()).toBe(1);
    });

    it("removes the friendship (order-independent) and reports whether a row was removed", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        await addFriendship(alice.user_id, bob.user_id);

        expect((await removeFriendship(bob.user_id, alice.user_id)).removed).toBe(true);
        expect(await areFriends(alice.user_id, bob.user_id)).toBe(false);
        expect(await countRows()).toBe(0);

        // Removing a non-existent friendship is a graceful no-op.
        expect((await removeFriendship(alice.user_id, bob.user_id)).removed).toBe(false);
    });

    it("getFriends joins users and returns the other side's username for each user", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        const carol = await insertUser();
        await addFriendship(alice.user_id, bob.user_id);
        await addFriendship(alice.user_id, carol.user_id);

        const aliceFriends = await getFriends(alice.user_id);
        expect(aliceFriends).toHaveLength(2);
        expect(aliceFriends).toEqual(
            expect.arrayContaining([
                { username: bob.username, user_id: bob.user_id },
                { username: carol.username, user_id: carol.user_id },
            ]),
        );

        // Bob only sees alice.
        expect(await getFriends(bob.user_id)).toEqual([
            { username: alice.username, user_id: alice.user_id },
        ]);
    });

    it("getFriendsPage walks all friends via the cursor in a stable order, without gaps or dupes", async () => {
        const me = await insertUser();
        const friends = [];
        for (let i = 0; i < 7; i++) friends.push(await insertUser());
        for (const f of friends) await addFriendship(me.user_id, f.user_id);

        const limit = 3;
        const collected: string[] = [];
        let cursor: { createdAt: string; userId: string } | undefined;
        let pages = 0;

        for (;;) {
            const page = await getFriendsPage(me.user_id, { before: cursor, limit });
            pages++;
            expect(page.friends.length).toBeLessThanOrEqual(limit);
            collected.push(...page.friends.map((f) => f.user_id));
            if (!page.hasMore) {
                expect(page.cursor).not.toBeNull();
                break;
            }
            expect(page.cursor).not.toBeNull();
            cursor = page.cursor!;
        }

        // 7 friends over pages of 3 => 3 pages (3 + 3 + 1), full coverage, no duplicates.
        expect(pages).toBe(3);
        expect(collected).toHaveLength(friends.length);
        expect(new Set(collected).size).toBe(friends.length);
        expect(new Set(collected)).toEqual(new Set(friends.map((f) => f.user_id)));
    });

    it("getFriendsPage reports hasMore=false and a null cursor for an empty friend list", async () => {
        const loner = await insertUser();
        const page = await getFriendsPage(loner.user_id, { limit: 15 });
        expect(page.friends).toEqual([]);
        expect(page.hasMore).toBe(false);
        expect(page.cursor).toBeNull();
    });
});
