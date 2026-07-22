import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "@chakra-ui/react";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { renderWithProviders } from "../../../test/renderWithProviders.jsx";
import { SocketContext } from "../../../contexts/Socket/SocketContext.js";
import { FriendsContext } from "../../../contexts/Friends/FriendsContext.js";
import { MessagesContext } from "../../../contexts/Messages/MessagesContext.js";
import { FriendRow } from "./FriendRow.jsx";

const friend = { username: "bob", user_id: "bob-id", connected: true };

function setup(emitImpl, friendOverride, tabValue = null) {
    const socket = { emit: vi.fn(emitImpl) };
    const setFriendList = vi.fn();
    const setMessages = vi.fn();
    renderWithProviders(
        <SocketContext.Provider value={{ socket }}>
            <FriendsContext.Provider value={{ setFriendList }}>
                <MessagesContext.Provider value={{ setMessages }}>
                    <Tabs.Root value={tabValue}>
                        <Tabs.List>
                            <FriendRow friend={friendOverride ?? friend} />
                        </Tabs.List>
                    </Tabs.Root>
                </MessagesContext.Provider>
            </FriendsContext.Provider>
        </SocketContext.Provider>,
    );
    return { socket, setFriendList, setMessages };
}

// Removal moved behind the row's overflow menu, so every removal test opens it first.
const openRowMenu = async () =>
    userEvent.click(screen.getByRole("button", { name: "Conversation options for bob" }));

describe("FriendRow", () => {
    it("falls back to the username when the account has no full name", () => {
        setup();
        expect(screen.getByText("bob")).toBeInTheDocument();
    });

    it("shows the full name instead of the username, with the last-message preview", () => {
        setup(undefined, {
            ...friend,
            full_name: "Bob Brown",
            conversationId: 7,
            lastMessage: { content: "see you then", createdAt: new Date().toISOString() },
        });

        expect(screen.getByText("Bob Brown")).toBeInTheDocument();
        expect(screen.queryByText("bob")).not.toBeInTheDocument();
        expect(screen.getByText("see you then")).toBeInTheDocument();
    });

    it("renders a placeholder, not a preview, for a conversation with no messages yet", () => {
        setup(undefined, {
            ...friend,
            full_name: "Bob Brown",
            conversationId: 7,
            lastMessage: null,
        });

        expect(screen.getByText("Bob Brown")).toBeInTheDocument();
        expect(screen.queryByText("see you then")).not.toBeInTheDocument();
        // Keeps every row two lines tall so the list does not read as ragged.
        expect(screen.getByText("No messages yet")).toBeInTheDocument();
    });

    it("exposes presence as data-status for the realtime-presence E2E contract", () => {
        setup(undefined, { ...friend, connected: false });
        expect(screen.getByLabelText("bob is offline")).toHaveAttribute("data-status", "offline");
    });

    describe("unread", () => {
        it("renders the unread count when there are unread messages", () => {
            setup(undefined, { ...friend, conversationId: 7, unreadCount: 3 });
            expect(screen.getByText("3")).toBeInTheDocument();
        });

        it("caps the displayed count at 99+", () => {
            setup(undefined, { ...friend, conversationId: 7, unreadCount: 250 });
            expect(screen.getByText("99+")).toBeInTheDocument();
        });

        it("renders no badge when everything is read", () => {
            setup(undefined, { ...friend, conversationId: 7, unreadCount: 0 });
            expect(screen.queryByLabelText(/unread messages/)).not.toBeInTheDocument();
        });
    });

    it("marks the row selected when it is the active tab", () => {
        setup(undefined, friend, "bob-id");
        // Tabs.Trigger exposes selection as data-selected, which drives the accent bar + fill.
        expect(screen.getByRole("tab", { name: /bob/ })).toHaveAttribute("data-selected");
    });

    it("exposes the confirm as role=dialog named 'Remove <name>?'", async () => {
        // Mirrors how friends.spec.js locates it. Asserted here so a role change (e.g. switching to
        // `alertdialog`, which getByRole("dialog") does NOT match) fails in seconds rather than
        // surfacing as a timeout in a multi-browser E2E run.
        setup();

        await openRowMenu();
        await userEvent.click(screen.getByRole("menuitem", { name: "Remove bob" }));

        expect(screen.getByRole("dialog", { name: "Remove bob?" })).toBeInTheDocument();
    });

    it("emits REMOVE_FRIEND and removes the friend on confirm", async () => {
        const { socket, setFriendList } = setup((event, payload, cb) => cb({ done: true }));

        await openRowMenu();
        await userEvent.click(screen.getByRole("menuitem", { name: "Remove bob" }));
        await userEvent.click(screen.getByRole("button", { name: "Remove" }));

        expect(socket.emit).toHaveBeenCalledWith(
            SOCKET_EVENTS.REMOVE_FRIEND,
            { username: "bob", user_id: "bob-id" },
            expect.any(Function),
        );
        const updater = setFriendList.mock.calls[0][0];
        expect(updater([friend, { username: "x", user_id: "x-id" }])).toEqual([
            { username: "x", user_id: "x-id" },
        ]);
    });

    it("does not emit REMOVE_FRIEND when the confirm dialog is cancelled", async () => {
        const { socket } = setup();

        await openRowMenu();
        await userEvent.click(screen.getByRole("menuitem", { name: "Remove bob" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(socket.emit).not.toHaveBeenCalled();
    });
});
