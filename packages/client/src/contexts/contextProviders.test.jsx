import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useContext } from "react";
import { FriendsContext } from "./Friends/FriendsContext.js";
import { FriendsContextProvider } from "./Friends/FriendsContextProvider.jsx";
import { MessagesContext } from "./Messages/MessagesContext.js";
import { MessagesContextProvider } from "./Messages/MessagesContextProvider.jsx";

// The pagination code reads these defaults directly: useSocketSetup replaces `friendsMeta` from
// the FRIENDS_LIST payload, and SideBar/ChatMessages gate their scroll handlers on `hasMore` /
// `loading`. Pin the initial shape so a change here can't silently disable infinite scroll.
describe("FriendsContextProvider", () => {
    it("starts with an empty list and pagination disabled until FRIENDS_LIST arrives", () => {
        const { result } = renderHook(() => useContext(FriendsContext), {
            wrapper: FriendsContextProvider,
        });

        expect(result.current.friendList).toEqual([]);
        expect(result.current.friendsMeta).toEqual({
            cursor: null,
            hasMore: false,
            loading: false,
        });
        expect(typeof result.current.setFriendList).toBe("function");
        expect(typeof result.current.setFriendsMeta).toBe("function");
    });
});

describe("MessagesContextProvider", () => {
    it("starts with no messages and no per-conversation pagination state", () => {
        const { result } = renderHook(() => useContext(MessagesContext), {
            wrapper: MessagesContextProvider,
        });

        expect(result.current.messages).toEqual([]);
        // an empty map means each conversation defaults to "there may be older messages"
        expect(result.current.conversationMeta).toEqual({});
        expect(typeof result.current.setMessages).toBe("function");
        expect(typeof result.current.setConversationMeta).toBe("function");
    });
});
