// Move the conversation a (new) message belongs to to the TOP of the friend/inbox list and refresh
// its last-message preview — the client-side mirror of the server's fan-out-on-write ordering.
// Matching is by conversationId. A message for a conversation not currently loaded (beyond the
// paged-in list) leaves the list unchanged: the server order already accounts for it, and it will
// appear correctly ordered when scrolled into view. Only call this for NEW messages (a live receive
// or a just-sent ack) — never for history / initial loads, which must not reorder.
//
// `incrementUnread` bumps the local badge for a message that arrived in a conversation the user is
// not currently looking at. It is opt-in because the send-ack path also calls this, and your own
// message must never mark itself unread. The count is only ever a local echo — the authoritative
// value is derived server-side from the read pointer on the next load.
export const bumpConversation = (friendList, message, { incrementUnread = false } = {}) => {
    if (!message || message.conversationId == null) return friendList;

    const idx = friendList.findIndex((f) => f.conversationId === message.conversationId);
    if (idx === -1) return friendList;

    const updated = {
        ...friendList[idx],
        lastMessage: { content: message.content, createdAt: message.createdAt },
        ...(incrementUnread ? { unreadCount: (friendList[idx].unreadCount ?? 0) + 1 } : {}),
    };
    return [updated, ...friendList.filter((_, i) => i !== idx)];
};
