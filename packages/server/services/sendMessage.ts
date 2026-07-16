import { db } from "../db/index.js";
import { saveMessage } from "../db/repositories/messages.js";
import { bumpConversationLastMessage } from "../db/repositories/conversations.js";
import type { Message } from "../db/schema/messages.js";

/**
 * Persist a message and fan the sort pointer out to the conversation's members, in ONE transaction.
 * This is the atomicity guarantee the inbox depends on: the message INSERT and the member-row
 * `last_message_id` bump commit together or not at all, so the list can never show a stale "latest
 * message". Fan-out is one bounded `UPDATE ... WHERE conversation_id` (rows = members of THIS
 * conversation, not system-wide) — no queue, synchronous, same DB.
 */
export const sendMessage = async (input: {
    message_id: string;
    conversation_id: number;
    sender_user_id: string;
    content: string;
}): Promise<Message> => {
    return db.transaction(async (tx) => {
        const row = await saveMessage(input, tx);
        await bumpConversationLastMessage(input.conversation_id, row.id, tx);
        return row;
    });
};
