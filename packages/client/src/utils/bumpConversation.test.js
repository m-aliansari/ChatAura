import { describe, it, expect } from "vitest";
import { bumpConversation } from "./bumpConversation.js";

const list = [
    { user_id: "a", conversationId: 1, lastMessage: { content: "old a", createdAt: "t0" } },
    { user_id: "b", conversationId: 2, lastMessage: null },
    { user_id: "c", conversationId: 3, lastMessage: { content: "old c", createdAt: "t0" } },
];

describe("bumpConversation", () => {
    it("moves the matching conversation to the front and refreshes its preview", () => {
        const result = bumpConversation(list, {
            conversationId: 3,
            content: "new c",
            createdAt: "t9",
        });
        expect(result.map((f) => f.user_id)).toEqual(["c", "a", "b"]);
        expect(result[0].lastMessage).toEqual({ content: "new c", createdAt: "t9" });
    });

    it("does not mutate the original list", () => {
        const copy = JSON.parse(JSON.stringify(list));
        bumpConversation(list, { conversationId: 1, content: "x", createdAt: "t9" });
        expect(list).toEqual(copy);
    });

    it("leaves the list unchanged when the conversation is not loaded", () => {
        const result = bumpConversation(list, {
            conversationId: 999,
            content: "x",
            createdAt: "t9",
        });
        expect(result).toBe(list);
    });

    it("leaves the list unchanged for a message without a conversationId", () => {
        expect(bumpConversation(list, { content: "x" })).toBe(list);
        expect(bumpConversation(list, null)).toBe(list);
    });

    describe("unread", () => {
        const msg = { conversationId: 3, content: "new c", createdAt: "t9" };

        it("does not touch the count by default — the send-ack path must never self-mark unread", () => {
            expect(bumpConversation(list, msg)[0].unreadCount).toBeUndefined();
        });

        it("starts the count at 1 for a conversation that had none", () => {
            expect(bumpConversation(list, msg, { incrementUnread: true })[0].unreadCount).toBe(1);
        });

        it("increments an existing count", () => {
            const withUnread = list.map((f) =>
                f.conversationId === 3 ? { ...f, unreadCount: 4 } : f,
            );
            expect(
                bumpConversation(withUnread, msg, { incrementUnread: true })[0].unreadCount,
            ).toBe(5);
        });

        it("only affects the conversation the message belongs to", () => {
            const result = bumpConversation(list, msg, { incrementUnread: true });
            expect(result.filter((f) => f.conversationId !== 3).every((f) => !f.unreadCount)).toBe(
                true,
            );
        });
    });
});
