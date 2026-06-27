import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { UserContext } from "../contexts/User/UserContext.js"
import { SocketContext } from "../contexts/Socket/SocketContext.js"
import { FriendsContext } from "../contexts/Friends/FriendsContext.js"
import { MessagesContext } from "../contexts/Messages/MessagesContext.js"

const navigateMock = vi.fn()
vi.mock("react-router-dom", async (orig) => ({
    ...(await orig()),
    useNavigate: () => navigateMock,
}))
vi.mock("firebase/messaging", () => ({
    getToken: vi.fn().mockResolvedValue(null), // no device token -> cleanup no-ops
    deleteToken: vi.fn().mockResolvedValue(true),
}))
vi.mock("../utils/firebase.js", () => ({ messaging: {} }))

const { useLogout } = await import("./useLogout.jsx")

function setup() {
    const socket = { disconnect: vi.fn() }
    const setUser = vi.fn()
    const setFriendList = vi.fn()
    const setMessages = vi.fn()
    const wrapper = ({ children }) => (
        <UserContext.Provider value={{ user: { token: "jwt-1" }, setUser }}>
            <SocketContext.Provider value={{ socket }}>
                <FriendsContext.Provider value={{ setFriendList }}>
                    <MessagesContext.Provider value={{ setMessages }}>
                        {children}
                    </MessagesContext.Provider>
                </FriendsContext.Provider>
            </SocketContext.Provider>
        </UserContext.Provider>
    )
    const { result } = renderHook(() => useLogout(), { wrapper })
    return { logout: result.current, socket, setUser, setFriendList, setMessages }
}

describe("useLogout", () => {
    beforeEach(() => {
        navigateMock.mockClear()
        localStorage.setItem("token", "jwt-1")
    })

    it("performs a full local logout immediately", () => {
        const { logout, socket, setUser, setFriendList, setMessages } = setup()

        logout()

        expect(socket.disconnect).toHaveBeenCalledOnce()
        expect(setFriendList).toHaveBeenCalledWith([])
        expect(setMessages).toHaveBeenCalledWith([])
        expect(localStorage.getItem("token")).toBeNull()
        expect(setUser).toHaveBeenCalledWith({ loggedIn: false })
        expect(navigateMock).toHaveBeenCalledWith("/")
    })
})
