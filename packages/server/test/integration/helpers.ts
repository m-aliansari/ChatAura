import { addFriendship } from "../../db/repositories/friendships.js";
import { getConversation } from "../../db/repositories/messages.js";
import {
    getDirectConversationId,
    getOrCreateDirectConversation,
} from "../../db/repositories/conversations.js";
import { registerUser } from "../../services/registerUser.js";

let counter = 0;

/** Creates a user via the domain service and returns its row + plaintext password. */
export async function insertUser({
    username,
    password = "secret1",
    fullName,
}: { username?: string; password?: string; fullName?: string } = {}) {
    const name = username ?? `user${Date.now()}${counter++}`;
    // Route through registerUser (not addUser directly) so the fixture user satisfies the
    // credential rules and can log in — see BUG_POSTMORTEMS #3.
    const result = await registerUser({
        username: name,
        password,
        fullName: fullName ?? "Test User",
    });
    if (!result.ok) {
        throw new Error(`insertUser failed (${name}): ${result.reason}`);
    }
    return { ...result.user, password };
}

/**
 * Seeds a friendship in Postgres (mirrors handleSocketAddFriend): the canonical friendship row AND
 * its direct conversation. The sidebar/inbox is built from conversation_members, so a friendship
 * without a conversation would not render.
 */
export async function befriend(
    a: { username: string; user_id: string },
    b: { username: string; user_id: string },
) {
    await addFriendship(a.user_id, b.user_id);
    await getOrCreateDirectConversation(a.user_id, b.user_id);
}

/**
 * Read a direct conversation's messages by user pair — test convenience over the conversation-id
 * API. Returns [] when no direct conversation exists (e.g. a rejected send never created one).
 */
export async function conversationMessages(aUserId: string, bUserId: string) {
    const conversationId = await getDirectConversationId(aUserId, bUserId);
    if (conversationId === undefined) return [];
    return (await getConversation(conversationId, { limit: 100 })).messages;
}
