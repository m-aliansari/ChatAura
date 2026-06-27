import { describe, it, expect, vi } from "vitest"
import { screen } from "@testing-library/react"
import { Tabs } from "@chakra-ui/react"
import { SOCKET_EVENTS } from "@realtime-chatapp/common"
import { renderWithProviders } from "../../test/renderWithProviders.jsx"
import { SocketContext } from "../../contexts/Socket/SocketContext.js"
import { FriendsContext } from "../../contexts/Friends/FriendsContext.js"
import { MessagesContext } from "../../contexts/Messages/MessagesContext.js"
import { ChatMessages } from "./ChatMessages.jsx"

function setup({ friendList, messages }) {
    const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
    renderWithProviders(
        <SocketContext.Provider value={{ socket }}>
            <FriendsContext.Provider value={{ friendList }}>
                <MessagesContext.Provider value={{ messages, setMessages: vi.fn() }}>
                    <Tabs.Root value="bob-id">
                        <ChatMessages />
                    </Tabs.Root>
                </MessagesContext.Provider>
            </FriendsContext.Provider>
        </SocketContext.Provider>
    )
}

describe("ChatMessages", () => {
    it("shows only the messages exchanged with the active friend", () => {
        setup({
            friendList: [{ username: "bob", user_id: "bob-id" }],
            messages: [
                { to: "bob-id", from: "me", content: "hi bob", messageId: "m1" },
                { to: "someone", from: "x", content: "not shown", messageId: "m2" },
            ],
        })
        expect(screen.getByText("hi bob")).toBeInTheDocument()
        expect(screen.queryByText("not shown")).not.toBeInTheDocument()
    })

    it("shows an empty-state prompt when there are no friends", () => {
        setup({ friendList: [], messages: [] })
        expect(
            screen.getByText("No friends added. Click add friend to start chatting")
        ).toBeInTheDocument()
    })

    it("registers and cleans up socket listeners", () => {
        const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
        const { unmount } = renderWithProviders(
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider value={{ friendList: [] }}>
                    <MessagesContext.Provider value={{ messages: [], setMessages: vi.fn() }}>
                        <Tabs.Root value={null}>
                            <ChatMessages />
                        </Tabs.Root>
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>
        )
        expect(socket.on).toHaveBeenCalled()
        unmount()
        expect(socket.off).toHaveBeenCalled()
    })

    it("dedupes a duplicate DIRECT_MESSAGE by messageId", () => {
        const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
        const setMessages = vi.fn()
        renderWithProviders(
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider value={{ friendList: [{ username: "bob", user_id: "bob-id" }] }}>
                    <MessagesContext.Provider value={{ messages: [], setMessages }}>
                        <Tabs.Root value="bob-id">
                            <ChatMessages />
                        </Tabs.Root>
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>
        )

        const handler = socket.on.mock.calls.find(
            (c) => c[0] === SOCKET_EVENTS.DIRECT_MESSAGE
        )[1]
        handler({ messageId: "m1", to: "bob-id", from: "me", content: "hi" })
        const updater = setMessages.mock.calls.at(-1)[0]

        const prev = [{ messageId: "m1", to: "bob-id", from: "me", content: "hi" }]
        expect(updater(prev)).toBe(prev) // duplicate id -> list unchanged
    })
})
