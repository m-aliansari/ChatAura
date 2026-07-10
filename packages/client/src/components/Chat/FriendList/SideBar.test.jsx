import { describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { Tabs } from "@chakra-ui/react";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { renderWithProviders } from "../../../test/renderWithProviders.jsx";
import { UserContext } from "../../../contexts/User/UserContext.js";
import { SocketContext } from "../../../contexts/Socket/SocketContext.js";
import { FriendsContext } from "../../../contexts/Friends/FriendsContext.js";
import { MessagesContext } from "../../../contexts/Messages/MessagesContext.js";

// SideBar -> useLogout pulls in firebase at import time; stub that boundary.
vi.mock("firebase/messaging", () => ({
    getToken: vi.fn().mockResolvedValue(null),
    deleteToken: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../utils/firebase.js", () => ({ messaging: {} }));

const { SideBar } = await import("./SideBar.jsx");

const cursor = { createdAt: "2026-01-01 00:00:00.000001+00", userId: "bob-id" };
const friendList = [{ username: "bob", user_id: "bob-id", connected: true }];

// jsdom reports scrollHeight/scrollTop/clientHeight as 0, so any scroll event lands at the
// bottom threshold and triggers the load — the condition we want to exercise.
function setup({ friendsMeta, emitImpl } = {}) {
    const socket = { emit: vi.fn(emitImpl) };
    const setFriendList = vi.fn();
    const setFriendsMeta = vi.fn();
    const setMessages = vi.fn();
    renderWithProviders(
        <UserContext.Provider value={{ user: { token: "jwt" }, setUser: vi.fn() }}>
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider
                    value={{
                        friendList,
                        setFriendList,
                        friendsMeta: friendsMeta ?? { cursor, hasMore: true, loading: false },
                        setFriendsMeta,
                    }}
                >
                    <MessagesContext.Provider value={{ setMessages }}>
                        <Tabs.Root value={null}>
                            <SideBar />
                        </Tabs.Root>
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>
        </UserContext.Provider>,
    );
    return { socket, setFriendList, setFriendsMeta, setMessages };
}

const loadMoreCalls = (socket) =>
    socket.emit.mock.calls.filter((c) => c[0] === SOCKET_EVENTS.LOAD_MORE_FRIENDS);

describe("SideBar — friends infinite scroll (LOAD_MORE_FRIENDS)", () => {
    it("emits LOAD_MORE_FRIENDS with the current cursor and appends the page", () => {
        const nextCursor = { createdAt: "2026-01-01 00:00:00.000002+00", userId: "carol-id" };
        const page = [{ username: "carol", user_id: "carol-id", connected: false }];
        const pageMessages = [
            { id: 9, messageId: "m9", to: "me", from: "carol-id", content: "yo" },
        ];

        const { socket, setFriendList, setFriendsMeta, setMessages } = setup({
            emitImpl: (event, payload, cb) => {
                if (event === SOCKET_EVENTS.LOAD_MORE_FRIENDS)
                    cb({
                        friends: page,
                        hasMore: false,
                        cursor: nextCursor,
                        messages: pageMessages,
                    });
            },
        });

        fireEvent.scroll(screen.getByTestId("friends-scroll"));

        const [[, payload]] = loadMoreCalls(socket);
        expect(payload).toEqual({ cursor });

        // page appended after the existing friends
        const friendsUpdater = setFriendList.mock.calls.at(-1)[0];
        expect(friendsUpdater(friendList).map((f) => f.user_id)).toEqual(["bob-id", "carol-id"]);

        // the page's messages are merged into the flat message list
        const msgUpdater = setMessages.mock.calls.at(-1)[0];
        expect(msgUpdater([]).map((m) => m.messageId)).toEqual(["m9"]);

        // meta settles on the server's cursor + hasMore
        expect(setFriendsMeta.mock.calls.at(-1)[0]).toEqual({
            cursor: nextCursor,
            hasMore: false,
            loading: false,
        });
    });

    it("does not re-add a friend already in the list (dedupe by user_id)", () => {
        const { socket, setFriendList } = setup({
            emitImpl: (event, payload, cb) => {
                if (event === SOCKET_EVENTS.LOAD_MORE_FRIENDS)
                    cb({ friends: [...friendList], hasMore: false, cursor: null, messages: [] });
            },
        });

        fireEvent.scroll(screen.getByTestId("friends-scroll"));

        const friendsUpdater = setFriendList.mock.calls.at(-1)[0];
        expect(friendsUpdater(friendList)).toHaveLength(1);
        expect(loadMoreCalls(socket)).toHaveLength(1);
    });

    it("does not emit once the friend list is fully loaded", () => {
        const { socket } = setup({ friendsMeta: { cursor, hasMore: false, loading: false } });

        fireEvent.scroll(screen.getByTestId("friends-scroll"));

        expect(loadMoreCalls(socket)).toHaveLength(0);
    });

    it("does not emit while a page is already in flight", () => {
        const { socket } = setup({ friendsMeta: { cursor, hasMore: true, loading: true } });

        fireEvent.scroll(screen.getByTestId("friends-scroll"));

        expect(loadMoreCalls(socket)).toHaveLength(0);
    });

    it("guards against a double-fire when scroll events arrive back-to-back", () => {
        const { socket } = setup({ emitImpl: () => {} }); // never acks -> stays in flight

        const el = screen.getByTestId("friends-scroll");
        fireEvent.scroll(el);
        fireEvent.scroll(el);

        expect(loadMoreCalls(socket)).toHaveLength(1);
    });

    it("shows an accessible loading indicator only while a page is in flight", () => {
        setup({ friendsMeta: { cursor, hasMore: true, loading: false } });
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        cleanup();

        setup({ friendsMeta: { cursor, hasMore: true, loading: true } });
        const status = screen.getByRole("status");
        expect(status).toHaveTextContent("Loading more friends");
        // announced politely, and never nested inside the tablist
        expect(status).toHaveAttribute("aria-live", "polite");
        expect(screen.getByTestId("friends-scroll")).not.toContainElement(status);
    });
});
