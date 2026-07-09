import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the two boundaries the consumer touches: FCM (tokens + send) and the redis singleton.
const getFcmTokens = vi.fn();
const sendChatNotifications = vi.fn();
vi.mock("../fcm.js", () => ({
    getFcmTokens: (...a: unknown[]) => getFcmTokens(...a),
    sendChatNotifications: (...a: unknown[]) => sendChatNotifications(...a),
}));
vi.mock("../redis.js", () => ({ redisClient: { publish: vi.fn(), duplicate: vi.fn() } }));

const { handleMessageSent } = await import("./messageSentSubscriber.js");

const event = (over: Partial<Record<string, string>> = {}) =>
    JSON.stringify({ to: "to-id", from: "from-id", content: "hi", messageId: "m1", ...over });

beforeEach(() => {
    getFcmTokens.mockReset();
    sendChatNotifications.mockReset();
});

describe("message-sent consumer (handleMessageSent)", () => {
    it("sends a chat notification to the recipient's tokens", async () => {
        getFcmTokens.mockResolvedValue(["tok-a", "tok-b"]);

        await handleMessageSent(event({ content: "ping" }));

        expect(getFcmTokens).toHaveBeenCalledWith("to-id");
        expect(sendChatNotifications).toHaveBeenCalledWith(["tok-a", "tok-b"], "ping", "from-id");
    });

    it("does not send when the recipient has no tokens", async () => {
        getFcmTokens.mockResolvedValue([]);

        await handleMessageSent(event());

        expect(sendChatNotifications).not.toHaveBeenCalled();
    });

    it("swallows malformed payloads without throwing", async () => {
        await expect(handleMessageSent("not-json")).resolves.toBeUndefined();
        expect(sendChatNotifications).not.toHaveBeenCalled();
    });
});
