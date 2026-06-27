import { describe, it, expect, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Dialog } from "@chakra-ui/react"
import { SOCKET_EVENTS } from "@realtime-chatapp/common"
import { renderWithProviders } from "../../../test/renderWithProviders.jsx"
import { SocketContext } from "../../../contexts/Socket/SocketContext.js"
import { FriendsContext } from "../../../contexts/Friends/FriendsContext.js"
import { AddFriendModal } from "./AddFriendModal.jsx"

function setup(emitImpl) {
    const socket = { emit: vi.fn(emitImpl) }
    const setFriendList = vi.fn()
    renderWithProviders(
        <SocketContext.Provider value={{ socket }}>
            <FriendsContext.Provider value={{ setFriendList }}>
                <Dialog.Root open>
                    <AddFriendModal />
                </Dialog.Root>
            </FriendsContext.Provider>
        </SocketContext.Provider>
    )
    return { socket, setFriendList }
}

async function submitUsername(name) {
    await userEvent.type(screen.getByPlaceholderText("Enter Friend's username"), name)
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
}

describe("AddFriendModal", () => {
    it("emits ADD_FRIEND and adds the friend on success", async () => {
        const { socket, setFriendList } = setup((event, username, cb) =>
            cb({ done: true, addedFriend: { username, user_id: "u9", connected: true } })
        )

        await submitUsername("friend1")

        expect(socket.emit).toHaveBeenCalledWith(
            SOCKET_EVENTS.ADD_FRIEND,
            "friend1",
            expect.any(Function)
        )
        // setFriendList receives an updater that prepends the new friend
        const updater = setFriendList.mock.calls[0][0]
        expect(updater([])).toEqual([
            { username: "friend1", user_id: "u9", connected: true },
        ])
    })

    it("shows the server error message on failure", async () => {
        setup((event, username, cb) => cb({ done: false, errorMsg: "No such user exists!" }))

        await submitUsername("friend1")

        expect(await screen.findByText("No such user exists!")).toBeInTheDocument()
    })

    it("does not emit when the username is too short (validation)", async () => {
        const { socket } = setup()
        await submitUsername("abc")
        await waitFor(() =>
            expect(screen.getByText("Username too short")).toBeInTheDocument()
        )
        expect(socket.emit).not.toHaveBeenCalled()
    })
})
