import { describe, it, expect, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Tabs } from "@chakra-ui/react"
import { SOCKET_EVENTS } from "@realtime-chatapp/common"
import { renderWithProviders } from "../../../test/renderWithProviders.jsx"
import { SocketContext } from "../../../contexts/Socket/SocketContext.js"
import { FriendsContext } from "../../../contexts/Friends/FriendsContext.js"
import { MessagesContext } from "../../../contexts/Messages/MessagesContext.js"
import { FriendRow } from "./FriendRow.jsx"

const friend = { username: "bob", user_id: "bob-id", connected: true }

function setup(emitImpl) {
    const socket = { emit: vi.fn(emitImpl) }
    const setFriendList = vi.fn()
    const setMessages = vi.fn()
    renderWithProviders(
        <SocketContext.Provider value={{ socket }}>
            <FriendsContext.Provider value={{ setFriendList }}>
                <MessagesContext.Provider value={{ setMessages }}>
                    <Tabs.Root value={null}>
                        <Tabs.List>
                            <FriendRow friend={friend} />
                        </Tabs.List>
                    </Tabs.Root>
                </MessagesContext.Provider>
            </FriendsContext.Provider>
        </SocketContext.Provider>
    )
    return { socket, setFriendList, setMessages }
}

describe("FriendRow", () => {
    it("renders the friend's username", () => {
        setup()
        expect(screen.getByText("bob")).toBeInTheDocument()
    })

    it("emits REMOVE_FRIEND and removes the friend on confirm", async () => {
        const { socket, setFriendList } = setup((event, payload, cb) => cb({ done: true }))

        await userEvent.click(screen.getByRole("button", { name: "Remove bob" }))
        await userEvent.click(screen.getByRole("button", { name: "Remove" }))

        expect(socket.emit).toHaveBeenCalledWith(
            SOCKET_EVENTS.REMOVE_FRIEND,
            { username: "bob", user_id: "bob-id" },
            expect.any(Function)
        )
        const updater = setFriendList.mock.calls[0][0]
        expect(updater([friend, { username: "x", user_id: "x-id" }])).toEqual([
            { username: "x", user_id: "x-id" },
        ])
    })
})
