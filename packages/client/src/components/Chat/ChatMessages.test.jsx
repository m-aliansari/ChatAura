import { describe, it, expect, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { Tabs } from "@chakra-ui/react";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { renderWithProviders } from "../../test/renderWithProviders.jsx";
import { SocketContext } from "../../contexts/Socket/SocketContext.js";
import { FriendsContext } from "../../contexts/Friends/FriendsContext.js";
import { MessagesContext } from "../../contexts/Messages/MessagesContext.js";
import { ChatMessages } from "./ChatMessages.jsx";

function setup({ friendList, messages }) {
    const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    renderWithProviders(
        <SocketContext.Provider value={{ socket }}>
            <FriendsContext.Provider value={{ friendList, setFriendList: vi.fn() }}>
                <MessagesContext.Provider
                    value={{
                        messages,
                        setMessages: vi.fn(),
                        conversationMeta: {},
                        setConversationMeta: vi.fn(),
                    }}
                >
                    <Tabs.Root value="bob-id">
                        <ChatMessages />
                    </Tabs.Root>
                </MessagesContext.Provider>
            </FriendsContext.Provider>
        </SocketContext.Provider>,
    );
}

describe("ChatMessages", () => {
    it("shows only the messages exchanged with the active friend", () => {
        setup({
            friendList: [{ username: "bob", user_id: "bob-id" }],
            messages: [
                { to: "bob-id", from: "me", content: "hi bob", messageId: "m1" },
                { to: "someone", from: "x", content: "not shown", messageId: "m2" },
            ],
        });
        expect(screen.getByText("hi bob")).toBeInTheDocument();
        expect(screen.queryByText("not shown")).not.toBeInTheDocument();
    });

    it("shows an empty-state prompt when there are no friends", () => {
        setup({ friendList: [], messages: [] });
        expect(
            screen.getByText("No friends added. Click add friend to start chatting"),
        ).toBeInTheDocument();
    });

    it("registers and cleans up socket listeners", () => {
        const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        const { unmount } = renderWithProviders(
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider value={{ friendList: [], setFriendList: vi.fn() }}>
                    <MessagesContext.Provider
                        value={{
                            messages: [],
                            setMessages: vi.fn(),
                            conversationMeta: {},
                            setConversationMeta: vi.fn(),
                        }}
                    >
                        <Tabs.Root value={null}>
                            <ChatMessages />
                        </Tabs.Root>
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>,
        );
        expect(socket.on).toHaveBeenCalled();
        unmount();
        expect(socket.off).toHaveBeenCalled();
    });

    it("dedupes a duplicate DIRECT_MESSAGE by messageId", () => {
        const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        const setMessages = vi.fn();
        renderWithProviders(
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider
                    value={{
                        friendList: [{ username: "bob", user_id: "bob-id" }],
                        setFriendList: vi.fn(),
                    }}
                >
                    <MessagesContext.Provider
                        value={{
                            messages: [],
                            setMessages,
                            conversationMeta: {},
                            setConversationMeta: vi.fn(),
                        }}
                    >
                        <Tabs.Root value="bob-id">
                            <ChatMessages />
                        </Tabs.Root>
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>,
        );

        const handler = socket.on.mock.calls.find((c) => c[0] === SOCKET_EVENTS.DIRECT_MESSAGE)[1];
        handler({ id: 1, messageId: "m1", to: "bob-id", from: "me", content: "hi" });
        const updater = setMessages.mock.calls.at(-1)[0];

        const prev = [{ id: 1, messageId: "m1", to: "bob-id", from: "me", content: "hi" }];
        // duplicate messageId -> merged list does not grow
        expect(updater(prev)).toHaveLength(1);
    });

    it("MESSAGES merges the connect-time page in, newest-first, without dropping live messages", () => {
        const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        const setMessages = vi.fn();
        renderWithProviders(
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider
                    value={{
                        friendList: [{ username: "bob", user_id: "bob-id" }],
                        setFriendList: vi.fn(),
                    }}
                >
                    <MessagesContext.Provider
                        value={{
                            messages: [],
                            setMessages,
                            conversationMeta: {},
                            setConversationMeta: vi.fn(),
                        }}
                    >
                        <Tabs.Root value="bob-id">
                            <ChatMessages />
                        </Tabs.Root>
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>,
        );

        const handler = socket.on.mock.calls.find((c) => c[0] === SOCKET_EVENTS.MESSAGES)[1];
        handler([
            { id: 2, messageId: "m2", to: "bob-id", from: "me", content: "b" },
            { id: 4, messageId: "m4", to: "bob-id", from: "me", content: "d" },
        ]);

        const updater = setMessages.mock.calls.at(-1)[0];
        // an already-held live message (id 5) stays on top; the page merges in by id desc
        const prev = [{ id: 5, messageId: "m5", to: "bob-id", from: "me", content: "e" }];
        expect(updater(prev).map((m) => m.id)).toEqual([5, 4, 2]);
    });

    it("shows the typing indicator only for the active conversation", () => {
        const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        renderWithProviders(
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider
                    value={{
                        friendList: [{ username: "bob", user_id: "bob-id" }],
                        setFriendList: vi.fn(),
                    }}
                >
                    <MessagesContext.Provider
                        value={{
                            messages: [],
                            setMessages: vi.fn(),
                            conversationMeta: {},
                            setConversationMeta: vi.fn(),
                        }}
                    >
                        <Tabs.Root value="bob-id">
                            <ChatMessages />
                        </Tabs.Root>
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>,
        );

        const typing = socket.on.mock.calls.find((c) => c[0] === SOCKET_EVENTS.TYPING)[1];
        const stopTyping = socket.on.mock.calls.find((c) => c[0] === SOCKET_EVENTS.STOP_TYPING)[1];

        // a different conversation typing must not surface here
        act(() => typing({ from: "someone-else" }));
        expect(screen.queryByText("bob is typing")).not.toBeInTheDocument();

        act(() => typing({ from: "bob-id" }));
        expect(screen.getByText("bob is typing")).toBeInTheDocument();

        act(() => stopTyping({ from: "bob-id" }));
        expect(screen.queryByText("bob is typing")).not.toBeInTheDocument();
    });
});

describe("ChatMessages — scroll to load older (LOAD_OLDER)", () => {
    const messages = [
        { id: 5, messageId: "m5", to: "bob-id", from: "me", content: "newer" },
        { id: 3, messageId: "m3", to: "bob-id", from: "me", content: "older" },
    ];

    // jsdom reports scrollHeight/clientHeight/scrollTop as 0, so any scroll event lands at the
    // "oldest" edge and triggers the load — exactly the condition we want to exercise.
    function setupScroll({ conversationMeta = {}, emitImpl } = {}) {
        const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn(emitImpl) };
        const setMessages = vi.fn();
        const setConversationMeta = vi.fn();
        renderWithProviders(
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider
                    value={{
                        friendList: [{ username: "bob", user_id: "bob-id" }],
                        setFriendList: vi.fn(),
                    }}
                >
                    <MessagesContext.Provider
                        value={{ messages, setMessages, conversationMeta, setConversationMeta }}
                    >
                        <Tabs.Root value="bob-id">
                            <ChatMessages />
                        </Tabs.Root>
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>,
        );
        return { socket, setMessages, setConversationMeta };
    }

    const loadOlderCalls = (socket) =>
        socket.emit.mock.calls.filter((c) => c[0] === SOCKET_EVENTS.LOAD_OLDER);

    it("emits LOAD_OLDER cursored on the oldest loaded message and merges the reply", () => {
        const older = [{ id: 1, messageId: "m1", to: "bob-id", from: "me", content: "oldest" }];
        const { socket, setMessages, setConversationMeta } = setupScroll({
            emitImpl: (event, payload, cb) => {
                if (event === SOCKET_EVENTS.LOAD_OLDER) cb({ messages: older, hasMore: false });
            },
        });

        fireEvent.scroll(screen.getByTestId("messages-scroll:bob-id"));

        const [[, payload]] = loadOlderCalls(socket);
        // cursor is the smallest id currently held for this conversation
        expect(payload).toEqual({ friendUserId: "bob-id", before: 3 });

        // older page merged into the flat list
        const updater = setMessages.mock.calls.at(-1)[0];
        expect(updater(messages).map((m) => m.id)).toEqual([5, 3, 1]);

        // meta flipped to loading, then settled with the server's hasMore
        expect(setConversationMeta).toHaveBeenCalledTimes(2);
        expect(setConversationMeta.mock.calls.at(-1)[0]["bob-id"]).toEqual({
            hasMore: false,
            loading: false,
        });
    });

    it("does not emit LOAD_OLDER once the conversation has no older messages", () => {
        const { socket } = setupScroll({
            conversationMeta: { "bob-id": { hasMore: false, loading: false } },
        });

        fireEvent.scroll(screen.getByTestId("messages-scroll:bob-id"));

        expect(loadOlderCalls(socket)).toHaveLength(0);
    });

    it("does not emit LOAD_OLDER while a page is already in flight", () => {
        const { socket } = setupScroll({
            conversationMeta: { "bob-id": { hasMore: true, loading: true } },
        });

        fireEvent.scroll(screen.getByTestId("messages-scroll:bob-id"));

        expect(loadOlderCalls(socket)).toHaveLength(0);
    });

    it("guards against a double-fire when scroll events arrive back-to-back", () => {
        // The ref guard must block the second scroll before React commits `loading: true`.
        const { socket } = setupScroll({
            emitImpl: () => {}, // never acks -> stays in flight
        });

        const el = screen.getByTestId("messages-scroll:bob-id");
        fireEvent.scroll(el);
        fireEvent.scroll(el);

        expect(loadOlderCalls(socket)).toHaveLength(1);
    });

    it("shows an accessible loading indicator only while an older page is in flight", () => {
        setupScroll({ conversationMeta: { "bob-id": { hasMore: true, loading: false } } });
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        cleanup();

        setupScroll({ conversationMeta: { "bob-id": { hasMore: true, loading: true } } });
        const status = screen.getByRole("status");
        expect(status).toHaveTextContent("Loading older messages");
        expect(status).toHaveAttribute("aria-live", "polite");
    });
});
