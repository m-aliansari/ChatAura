import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

vi.mock("react-router-dom", async (orig) => ({
    ...(await orig()),
    useNavigate: () => vi.fn(),
}))
vi.mock("firebase/messaging", () => ({ getToken: vi.fn().mockResolvedValue("fcm") }))
vi.mock("../../utils/firebase.js", () => ({ messaging: {} }))

const UserContextProvider = (await import("./UserContextProvider.jsx")).default

function renderProvider() {
    return render(
        <MemoryRouter>
            <UserContextProvider>
                <div>child</div>
            </UserContextProvider>
        </MemoryRouter>
    )
}

describe("UserContextProvider — hostile environment", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    })
    afterEach(() => vi.restoreAllMocks())

    it("does not crash when localStorage is unavailable (private mode / disabled)", () => {
        // SPEC: the app degrades gracefully when storage throws.
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("localStorage disabled")
        })

        expect(() => renderProvider()).not.toThrow()
    })
})
