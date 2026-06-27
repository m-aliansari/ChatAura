import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { SOCKET_EVENTS } from "@realtime-chatapp/common"
import { UserContext } from "../contexts/User/UserContext.js"
import { FriendsContext } from "../contexts/Friends/FriendsContext.js"
import { MessagesContext } from "../contexts/Messages/MessagesContext.js"
import { SocketContext } from "../contexts/Socket/SocketContext.js"
import { useSocketSetup } from "./useSocketSetup.jsx"

function makeFakeSocket() {
    const handlers = {}
    return {
        connect: vi.fn(),
        on: vi.fn((event, cb) => {
            handlers[event] = cb
        }),
        off: vi.fn(),
        // test helper: invoke a registered handler
        emit: (event, ...args) => handlers[event]?.(...args),
        handlers,
    }
}

function renderSocketSetup({ socket, ctx, tabs } = {}) {
    const setUser = ctx?.setUser ?? vi.fn()
    const setFriendList = ctx?.setFriendList ?? vi.fn()
    const setMessages = ctx?.setMessages ?? vi.fn()

    const wrapper = ({ children }) => (
        <UserContext.Provider value={{ setUser }}>
            <FriendsContext.Provider value={{ setFriendList }}>
                <MessagesContext.Provider value={{ setMessages }}>
                    <SocketContext.Provider value={{ socket }}>
                        {children}
                    </SocketContext.Provider>
                </MessagesContext.Provider>
            </FriendsContext.Provider>
        </UserContext.Provider>
    )

    const view = renderHook(() => useSocketSetup(tabs), { wrapper })
    return { view, setUser, setFriendList, setMessages }
}

describe("useSocketSetup", () => {
    let socket
    beforeEach(() => {
        socket = makeFakeSocket()
    })

    it("connects and registers all event listeners", () => {
        renderSocketSetup({ socket })
        expect(socket.connect).toHaveBeenCalledOnce()
        for (const event of [
            SOCKET_EVENTS.FRIENDS_LIST,
            SOCKET_EVENTS.FRIEND_ADDED,
            SOCKET_EVENTS.FRIEND_REMOVED,
            SOCKET_EVENTS.CONNECTION_STATUS_CHANGED,
            SOCKET_EVENTS.CONNECTION_ERROR,
        ]) {
            expect(socket.on).toHaveBeenCalledWith(event, expect.any(Function))
        }
    })

    it("removes all listeners on unmount", () => {
        const { view } = renderSocketSetup({ socket })
        view.unmount()
        for (const event of [
            SOCKET_EVENTS.FRIENDS_LIST,
            SOCKET_EVENTS.FRIEND_ADDED,
            SOCKET_EVENTS.FRIEND_REMOVED,
            SOCKET_EVENTS.CONNECTION_STATUS_CHANGED,
            SOCKET_EVENTS.CONNECTION_ERROR,
        ]) {
            expect(socket.off).toHaveBeenCalledWith(event)
        }
    })

    it("FRIENDS_LIST replaces the friend list", () => {
        const setFriendList = vi.fn()
        renderSocketSetup({ socket, ctx: { setFriendList } })
        const list = [{ user_id: "u1" }]
        socket.emit(SOCKET_EVENTS.FRIENDS_LIST, list)
        expect(setFriendList).toHaveBeenCalledWith(list)
    })

    it("FRIEND_ADDED appends a new friend but ignores duplicates", () => {
        const setFriendList = vi.fn()
        renderSocketSetup({ socket, ctx: { setFriendList } })

        socket.emit(SOCKET_EVENTS.FRIEND_ADDED, { user_id: "u2" })
        const updater = setFriendList.mock.calls[0][0]

        expect(updater([{ user_id: "u1" }])).toEqual([{ user_id: "u1" }, { user_id: "u2" }])
        // duplicate -> unchanged list
        const prev = [{ user_id: "u2" }]
        expect(updater(prev)).toBe(prev)
    })

    it("FRIEND_REMOVED drops the friend, prunes their messages, and clears the active tab", () => {
        const setFriendList = vi.fn()
        const setMessages = vi.fn()
        const tabs = { value: "u2", setValue: vi.fn() }
        renderSocketSetup({ socket, ctx: { setFriendList, setMessages }, tabs })

        socket.emit(SOCKET_EVENTS.FRIEND_REMOVED, { user_id: "u2" })

        const friendUpdater = setFriendList.mock.calls[0][0]
        expect(friendUpdater([{ user_id: "u1" }, { user_id: "u2" }])).toEqual([
            { user_id: "u1" },
        ])

        const msgUpdater = setMessages.mock.calls[0][0]
        expect(
            msgUpdater([
                { to: "u2", from: "me" },
                { to: "u1", from: "me" },
            ])
        ).toEqual([{ to: "u1", from: "me" }])

        expect(tabs.setValue).toHaveBeenCalledWith(null)
    })

    it("CONNECTION_STATUS_CHANGED updates the matching friend's connected flag", () => {
        const setFriendList = vi.fn()
        renderSocketSetup({ socket, ctx: { setFriendList } })

        socket.emit(SOCKET_EVENTS.CONNECTION_STATUS_CHANGED, true, "bob")
        const updater = setFriendList.mock.calls[0][0]

        expect(
            updater([
                { username: "alice", connected: false },
                { username: "bob", connected: false },
            ])
        ).toEqual([
            { username: "alice", connected: false },
            { username: "bob", connected: true },
        ])
    })

    it("CONNECTION_ERROR logs the user out", () => {
        const setUser = vi.fn()
        renderSocketSetup({ socket, ctx: { setUser } })
        socket.emit(SOCKET_EVENTS.CONNECTION_ERROR, new Error("nope"))
        expect(setUser).toHaveBeenCalledWith({ loggedIn: false })
    })
})
