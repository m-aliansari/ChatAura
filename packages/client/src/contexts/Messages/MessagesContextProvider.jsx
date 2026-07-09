import { useState } from "react";
import { MessagesContext } from "./MessagesContext.js";

export const MessagesContextProvider = ({ children }) => {
    const [messages, setMessages] = useState([]);
    // Per-conversation pagination state for scroll-to-load-older, keyed by friend user_id:
    // { [friendUserId]: { hasMore: boolean, loading: boolean } }. A missing entry means
    // "assume there may be older messages" until a LOAD_OLDER reply proves otherwise.
    const [conversationMeta, setConversationMeta] = useState({});
    return (
        <MessagesContext.Provider
            value={{ messages, setMessages, conversationMeta, setConversationMeta }}
        >
            {children}
        </MessagesContext.Provider>
    );
};
