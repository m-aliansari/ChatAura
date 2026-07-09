import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "../../db/index.js";
import { messages } from "../../db/schema/messages.js";
import {
    deleteConversation,
    getConversation,
    getRecentMessagesForConversations,
    saveMessage,
} from "../../db/repositories/messages.js";
import { insertUser } from "./helpers.js";

const countRows = async () => {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(messages);
    return row.n;
};

/** Seed a message from -> to; returns the persisted row. */
const send = (from: string, to: string, content: string) =>
    saveMessage({ message_id: uuid(), from_user_id: from, to_user_id: to, content });

describe("messages repository (integration)", () => {
    it("persists one row and round-trips content containing dots (the delimiter-bug fix)", async () => {
        const alice = await insertUser();
        const bob = await insertUser();

        const row = await send(alice.user_id, bob.user_id, "3.14 is pi.");
        expect(await countRows()).toBe(1);
        expect(row.content).toBe("3.14 is pi.");
        expect(typeof row.id).toBe("number");
        expect(row.message_id).toBeTruthy();

        // Round-trips intact through a read.
        const { messages: read } = await getConversation(alice.user_id, bob.user_id, { limit: 10 });
        expect(read).toHaveLength(1);
        expect(read[0].content).toBe("3.14 is pi.");
    });

    it("getConversation returns a conversation newest-first, both directions only", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        const carol = await insertUser();

        await send(alice.user_id, bob.user_id, "a1");
        await send(bob.user_id, alice.user_id, "b1");
        await send(alice.user_id, carol.user_id, "to-carol"); // different conversation

        const { messages: convo } = await getConversation(alice.user_id, bob.user_id, {
            limit: 10,
        });
        expect(convo.map((m) => m.content)).toEqual(["b1", "a1"]); // newest-first
    });

    it("getConversation paginates with the `before` cursor and reports hasMore", async () => {
        const alice = await insertUser();
        const bob = await insertUser();

        const seeded = [];
        for (let i = 1; i <= 5; i++) seeded.push(await send(alice.user_id, bob.user_id, `m${i}`));

        const page1 = await getConversation(alice.user_id, bob.user_id, { limit: 2 });
        expect(page1.messages.map((m) => m.content)).toEqual(["m5", "m4"]);
        expect(page1.hasMore).toBe(true);

        const page2 = await getConversation(alice.user_id, bob.user_id, {
            limit: 2,
            before: page1.messages.at(-1)!.id,
        });
        expect(page2.messages.map((m) => m.content)).toEqual(["m3", "m2"]);
        expect(page2.hasMore).toBe(true);

        const page3 = await getConversation(alice.user_id, bob.user_id, {
            limit: 2,
            before: page2.messages.at(-1)!.id,
        });
        expect(page3.messages.map((m) => m.content)).toEqual(["m1"]);
        expect(page3.hasMore).toBe(false);

        // No gaps / duplicates across the walk.
        const walked = [...page1.messages, ...page2.messages, ...page3.messages].map((m) => m.id);
        expect(new Set(walked).size).toBe(seeded.length);
    });

    it("getRecentMessagesForConversations caps per conversation and scopes to the given ids", async () => {
        const me = await insertUser();
        const bob = await insertUser();
        const carol = await insertUser();
        const dave = await insertUser(); // not in the requested page

        for (let i = 1; i <= 4; i++) await send(me.user_id, bob.user_id, `bob${i}`);
        for (let i = 1; i <= 4; i++) await send(carol.user_id, me.user_id, `carol${i}`);
        await send(me.user_id, dave.user_id, "dave-should-be-excluded");

        const recent = await getRecentMessagesForConversations(
            me.user_id,
            [bob.user_id, carol.user_id],
            2,
        );

        // 2 per conversation, dave excluded.
        expect(recent).toHaveLength(4);
        const contents = recent.map((m) => m.content);
        expect(contents).toEqual(expect.arrayContaining(["bob4", "bob3", "carol4", "carol3"]));
        expect(contents).not.toContain("bob2");
        expect(contents).not.toContain("dave-should-be-excluded");

        // Globally newest-first (descending id).
        const ids = recent.map((m) => m.id);
        expect(ids).toEqual([...ids].sort((a, b) => b - a));

        // Empty id list is a no-op.
        expect(await getRecentMessagesForConversations(me.user_id, [], 2)).toEqual([]);
    });

    it("deleteConversation removes both directions and leaves other conversations intact", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        const carol = await insertUser();

        await send(alice.user_id, bob.user_id, "a->b");
        await send(bob.user_id, alice.user_id, "b->a");
        await send(alice.user_id, carol.user_id, "a->c");

        const { deleted } = await deleteConversation(bob.user_id, alice.user_id); // reversed order
        expect(deleted).toBe(2);

        expect(
            (await getConversation(alice.user_id, bob.user_id, { limit: 10 })).messages,
        ).toHaveLength(0);
        // Carol conversation untouched.
        expect(
            (await getConversation(alice.user_id, carol.user_id, { limit: 10 })).messages,
        ).toHaveLength(1);

        // Deleting an empty conversation is a graceful no-op.
        expect((await deleteConversation(alice.user_id, bob.user_id)).deleted).toBe(0);
    });
});
