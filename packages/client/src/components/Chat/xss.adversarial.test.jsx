import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { Tabs } from "@chakra-ui/react";
import { renderWithProviders } from "../../test/renderWithProviders.jsx";
import { SocketContext } from "../../contexts/Socket/SocketContext.js";
import { FriendsContext } from "../../contexts/Friends/FriendsContext.js";
import { MessagesContext } from "../../contexts/Messages/MessagesContext.js";
import { ChatMessages } from "./ChatMessages.jsx";
import { FriendRow } from "./FriendList/FriendRow.jsx";

// SPEC: user-supplied content is rendered as text, never interpreted as HTML.
const XSS = '<img src=x onerror="globalThis.__xss = true">';

afterEach(() => {
    delete globalThis.__xss;
});

describe("XSS — user content is escaped, not executed", () => {
    it("renders malicious message content as inert text", () => {
        const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        renderWithProviders(
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider
                    value={{ friendList: [{ username: "bob", user_id: "bob-id" }] }}
                >
                    <MessagesContext.Provider
                        value={{
                            messages: [{ to: "bob-id", from: "me", content: XSS, messageId: "m1" }],
                            setMessages: vi.fn(),
                        }}
                    >
                        <Tabs.Root value="bob-id">
                            <ChatMessages />
                        </Tabs.Root>
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>,
        );

        expect(screen.getByText(XSS)).toBeInTheDocument(); // shown as literal text
        expect(document.querySelector("img")).toBeNull(); // no element injected
        expect(globalThis.__xss).toBeUndefined(); // handler never fired
    });

    it("renders a malicious friend username as inert text", () => {
        const socket = { emit: vi.fn() };
        renderWithProviders(
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider value={{ setFriendList: vi.fn() }}>
                    <MessagesContext.Provider value={{ setMessages: vi.fn() }}>
                        <Tabs.Root value={null}>
                            <Tabs.List>
                                <FriendRow
                                    friend={{ username: XSS, user_id: "x", connected: true }}
                                />
                            </Tabs.List>
                        </Tabs.Root>
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>,
        );

        expect(screen.getByText(XSS)).toBeInTheDocument();
        expect(document.querySelector("img")).toBeNull();
        expect(globalThis.__xss).toBeUndefined();
    });
});
