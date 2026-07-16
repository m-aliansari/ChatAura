import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "../../db/index.js";
import { messages } from "../../db/schema/messages.js";
import {
    getConversation,
    getRecentMessagesForConversations,
    saveMessage,
} from "../../db/repositories/messages.js";
import { getOrCreateDirectConversation } from "../../db/repositories/conversations.js";
import { insertUser } from "./helpers.js";

const countRows = async () => {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(messages);
    return row.n;
};

/** Persist a message in the given conversation from `sender`; returns the persisted row. */
const send = (conversationId: number, sender: string, content: string) =>
    saveMessage({
        message_id: uuid(),
        conversation_id: conversationId,
        sender_user_id: sender,
        content,
    });

describe("messages repository (integration)", () => {
    it("persists one row, round-trips dotted content, and derives the recipient", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        const cid = await getOrCreateDirectConversation(alice.user_id, bob.user_id);

        const row = await send(cid, alice.user_id, "3.14 is pi.");
        expect(await countRows()).toBe(1);
        expect(row.content).toBe("3.14 is pi.");
        expect(typeof row.id).toBe("number");
        expect(row.message_id).toBeTruthy();

        // Round-trips intact through a read; `to_user_id` is derived from the conversation pair.
        const { messages: read } = await getConversation(cid, { limit: 10 });
        expect(read).toHaveLength(1);
        expect(read[0].content).toBe("3.14 is pi.");
        expect(read[0].to_user_id).toBe(bob.user_id);
    });

    it("getConversation returns a conversation newest-first, scoped to that conversation", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        const carol = await insertUser();
        const ab = await getOrCreateDirectConversation(alice.user_id, bob.user_id);
        const ac = await getOrCreateDirectConversation(alice.user_id, carol.user_id);

        await send(ab, alice.user_id, "a1");
        await send(ab, bob.user_id, "b1");
        await send(ac, alice.user_id, "to-carol"); // different conversation

        const { messages: convo } = await getConversation(ab, { limit: 10 });
        expect(convo.map((m) => m.content)).toEqual(["b1", "a1"]); // newest-first
    });

    it("getConversation paginates with the `before` cursor and reports hasMore", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        const cid = await getOrCreateDirectConversation(alice.user_id, bob.user_id);

        const seeded = [];
        for (let i = 1; i <= 5; i++) seeded.push(await send(cid, alice.user_id, `m${i}`));

        const page1 = await getConversation(cid, { limit: 2 });
        expect(page1.messages.map((m) => m.content)).toEqual(["m5", "m4"]);
        expect(page1.hasMore).toBe(true);

        const page2 = await getConversation(cid, { limit: 2, before: page1.messages.at(-1)!.id });
        expect(page2.messages.map((m) => m.content)).toEqual(["m3", "m2"]);
        expect(page2.hasMore).toBe(true);

        const page3 = await getConversation(cid, { limit: 2, before: page2.messages.at(-1)!.id });
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
        const cidBob = await getOrCreateDirectConversation(me.user_id, bob.user_id);
        const cidCarol = await getOrCreateDirectConversation(me.user_id, carol.user_id);
        const cidDave = await getOrCreateDirectConversation(me.user_id, dave.user_id);

        for (let i = 1; i <= 4; i++) await send(cidBob, me.user_id, `bob${i}`);
        for (let i = 1; i <= 4; i++) await send(cidCarol, carol.user_id, `carol${i}`);
        await send(cidDave, me.user_id, "dave-should-be-excluded");

        const recent = await getRecentMessagesForConversations([cidBob, cidCarol], 2);

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
        expect(await getRecentMessagesForConversations([], 2)).toEqual([]);
    });
});
