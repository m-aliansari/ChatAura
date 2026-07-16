import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "../../db/index.js";
import { conversationMembers } from "../../db/schema/conversationMembers.js";
import {
    getOrCreateDirectConversation,
    getDirectConversationId,
    getConversationsPage,
    deleteConversationCascade,
} from "../../db/repositories/conversations.js";
import { getConversation, saveMessage } from "../../db/repositories/messages.js";
import { sendMessage } from "../../services/sendMessage.js";
import { insertUser } from "./helpers.js";

const memberPointer = async (conversationId: number, userId: string) => {
    const [row] = await db
        .select({ last_message_id: conversationMembers.last_message_id })
        .from(conversationMembers)
        .where(
            and(
                eq(conversationMembers.conversation_id, conversationId),
                eq(conversationMembers.user_id, userId),
            ),
        );
    return row?.last_message_id ?? null;
};

const countMembers = async (conversationId: number) => {
    const rows = await db
        .select({ user_id: conversationMembers.user_id })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversation_id, conversationId));
    return rows.length;
};

describe("conversations repository (integration)", () => {
    it("getOrCreateDirectConversation is idempotent and order-independent, with two members", async () => {
        const alice = await insertUser();
        const bob = await insertUser();

        const first = await getOrCreateDirectConversation(alice.user_id, bob.user_id);
        const again = await getOrCreateDirectConversation(alice.user_id, bob.user_id);
        const reversed = await getOrCreateDirectConversation(bob.user_id, alice.user_id);

        expect(again).toBe(first);
        expect(reversed).toBe(first); // canonical pair — direction does not matter
        expect(await countMembers(first)).toBe(2);
        expect(await getDirectConversationId(alice.user_id, bob.user_id)).toBe(first);
    });

    it("sendMessage persists the message AND bumps last_message_id on BOTH members atomically", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        const cid = await getOrCreateDirectConversation(alice.user_id, bob.user_id);

        // Before any message, both pointers are null.
        expect(await memberPointer(cid, alice.user_id)).toBeNull();
        expect(await memberPointer(cid, bob.user_id)).toBeNull();

        const row = await sendMessage({
            message_id: uuid(),
            conversation_id: cid,
            sender_user_id: alice.user_id,
            content: "hello bob",
        });

        // The single fan-out UPDATE moved the pointer on every member to the new message id.
        expect(await memberPointer(cid, alice.user_id)).toBe(row.id);
        expect(await memberPointer(cid, bob.user_id)).toBe(row.id);

        const row2 = await sendMessage({
            message_id: uuid(),
            conversation_id: cid,
            sender_user_id: bob.user_id,
            content: "hi alice",
        });
        expect(await memberPointer(cid, alice.user_id)).toBe(row2.id);
        expect(await memberPointer(cid, bob.user_id)).toBe(row2.id);
    });

    it("getConversationsPage sorts by latest message, no-message convos last, with preview + name", async () => {
        const me = await insertUser({ username: "meuser", fullName: "Me Myself" });
        const anna = await insertUser({ username: "annauser", fullName: "Anna Adams" });
        const bill = await insertUser({ username: "billuser", fullName: "Bill Brown" });
        const cara = await insertUser({ username: "carauser", fullName: "Cara Clark" }); // no messages

        const cAnna = await getOrCreateDirectConversation(me.user_id, anna.user_id);
        const cBill = await getOrCreateDirectConversation(me.user_id, bill.user_id);
        await getOrCreateDirectConversation(me.user_id, cara.user_id); // exists, no messages

        // Anna first, then Bill — so Bill's conversation is the most recent.
        await sendMessage({
            message_id: uuid(),
            conversation_id: cAnna,
            sender_user_id: anna.user_id,
            content: "hi from anna",
        });
        await sendMessage({
            message_id: uuid(),
            conversation_id: cBill,
            sender_user_id: me.user_id,
            content: "hi bill",
        });

        const { conversations, hasMore, cursor } = await getConversationsPage(me.user_id, {
            limit: 10,
        });

        expect(hasMore).toBe(false);
        expect(cursor).not.toBeNull();
        // Bill (newest message) > Anna (older message) > Cara (no message).
        expect(conversations.map((c) => c.username)).toEqual(["billuser", "annauser", "carauser"]);
        expect(conversations.map((c) => c.full_name)).toEqual([
            "Bill Brown",
            "Anna Adams",
            "Cara Clark",
        ]);

        const bill_row = conversations[0];
        expect(bill_row.lastMessage?.content).toBe("hi bill");
        expect(bill_row.conversationId).toBe(cBill);

        const cara_row = conversations[2];
        expect(cara_row.lastMessage).toBeNull(); // no-message conversation
    });

    it("getConversationsPage walks the whole inbox via the cursor without gaps or dupes", async () => {
        const me = await insertUser();
        // 5 friends, each with one message so they all sit in the messaged section.
        const friends = [];
        for (let i = 0; i < 5; i++) {
            const f = await insertUser();
            const cid = await getOrCreateDirectConversation(me.user_id, f.user_id);
            await sendMessage({
                message_id: uuid(),
                conversation_id: cid,
                sender_user_id: me.user_id,
                content: `m${i}`,
            });
            friends.push(f.user_id);
        }

        const seen = new Set<string>();
        let cursor = undefined;
        let guard = 0;
        for (;;) {
            const page = await getConversationsPage(me.user_id, { before: cursor, limit: 2 });
            for (const c of page.conversations) seen.add(c.user_id);
            if (!page.hasMore) break;
            cursor = page.cursor ?? undefined;
            if (++guard > 10) throw new Error("cursor did not terminate");
        }
        expect(seen.size).toBe(friends.length);
        expect([...seen].sort()).toEqual([...friends].sort());
    });

    it("walks a MIXED inbox via the cursor, crossing from messaged into the no-message tail", async () => {
        // The cursor has two branches: one for the messaged section, one for the no-message tail
        // (a row-constructor keyset). The all-messaged walk above never reaches the second, which is
        // the subtler of the two — it must cross the boundary without gaps or duplicates.
        const me = await insertUser();

        // 3 friends WITH messages: the newest message sorts its conversation highest.
        const messaged: string[] = [];
        for (let i = 0; i < 3; i++) {
            const f = await insertUser();
            const cid = await getOrCreateDirectConversation(me.user_id, f.user_id);
            await sendMessage({
                message_id: uuid(),
                conversation_id: cid,
                sender_user_id: me.user_id,
                content: `msg ${i}`,
            });
            messaged.push(f.user_id);
        }

        // 3 friends with NO messages: they sort after all messaged ones, newest-added first.
        const empty: string[] = [];
        for (let i = 0; i < 3; i++) {
            const f = await insertUser();
            await getOrCreateDirectConversation(me.user_id, f.user_id);
            empty.push(f.user_id);
        }

        // messaged newest-first, then the no-message tail newest-added-first
        const expected = [...messaged].reverse().concat([...empty].reverse());

        const walked: string[] = [];
        let cursor = undefined;
        let sawNullCursor = false;
        for (let guard = 0; ; guard++) {
            const page = await getConversationsPage(me.user_id, { before: cursor, limit: 2 });
            walked.push(...page.conversations.map((c) => c.user_id));
            if (page.cursor?.lastMessageId === null) sawNullCursor = true;
            if (!page.hasMore) break;
            cursor = page.cursor ?? undefined;
            if (guard > 10) throw new Error("cursor did not terminate");
        }

        // Exact order across the boundary, every conversation exactly once.
        expect(walked).toEqual(expected);
        expect(new Set(walked).size).toBe(expected.length);
        // ...and the walk really did exercise the no-message-tail cursor branch.
        expect(sawNullCursor).toBe(true);
    });

    it("deleteConversationCascade removes the messages, members and the conversation row", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        const cid = await getOrCreateDirectConversation(alice.user_id, bob.user_id);
        await saveMessage({
            message_id: uuid(),
            conversation_id: cid,
            sender_user_id: alice.user_id,
            content: "x",
        });

        await deleteConversationCascade(cid);

        expect(await countMembers(cid)).toBe(0);
        expect((await getConversation(cid, { limit: 10 })).messages).toHaveLength(0);
        expect(await getDirectConversationId(alice.user_id, bob.user_id)).toBeUndefined();
    });
});
