import { hash } from "bcrypt";
import { v4 as uuid } from "uuid";
import { addUser } from "../../db/repositories/users.js";
import { addFriendship } from "../../db/repositories/friendships.js";
import { getConversation } from "../../db/repositories/messages.js";
import {
    getDirectConversationId,
    getOrCreateDirectConversation,
} from "../../db/repositories/conversations.js";

let counter = 0;

/** Inserts a user directly into Postgres and returns its row + plaintext password. */
export async function insertUser({
    username,
    password = "secret1",
    fullName,
}: { username?: string; password?: string; fullName?: string } = {}) {
    const name = username ?? `user${Date.now()}${counter++}`;
    const user_id = uuid();
    const passhash = await hash(password, 4); // low cost for test speed
    // addUser bypasses schema validation (direct data-access), so a display name is required here.
    const user = await addUser({
        user_id,
        username: name,
        full_name: fullName ?? "Test User",
        passhash,
    });
    return { ...user, password };
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
