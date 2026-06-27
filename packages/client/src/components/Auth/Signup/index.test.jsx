import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "../../../test/renderWithProviders.jsx"
import { UserContext } from "../../../contexts/User/UserContext.js"

const navigateMock = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
    const actual = await importOriginal()
    return { ...actual, useNavigate: () => navigateMock }
})

const { Signup } = await import("./index.jsx")

function renderSignup(setUser = vi.fn()) {
    renderWithProviders(
        <UserContext.Provider value={{ setUser }}>
            <Signup />
        </UserContext.Provider>
    )
    return { setUser }
}

async function fillAndSubmit() {
    await userEvent.type(screen.getByPlaceholderText("Enter username"), "alice1")
    await userEvent.type(screen.getByPlaceholderText("Enter password"), "secret1")
    await userEvent.click(screen.getByRole("button", { name: "Create Account" }))
}

describe("Signup", () => {
    beforeEach(() => {
        navigateMock.mockClear()
        vi.restoreAllMocks()
    })

    it("POSTs to the register endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ token: "jwt-1", loggedIn: true }),
        })
        vi.stubGlobal("fetch", fetchMock)
        renderSignup()

        await fillAndSubmit()

        await waitFor(() => expect(fetchMock).toHaveBeenCalled())
        const [url, opts] = fetchMock.mock.calls[0]
        expect(url).toBe("http://localhost:3000/auth/register")
        expect(JSON.parse(opts.body)).toEqual({ username: "alice1", password: "secret1" })
    })

    it("sets the user and navigates home on success", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ token: "jwt-1", loggedIn: true }),
        })
        vi.stubGlobal("fetch", fetchMock)
        const { setUser } = renderSignup()

        await fillAndSubmit()

        await waitFor(() => expect(setUser).toHaveBeenCalledWith({ token: "jwt-1", loggedIn: true }))
        expect(navigateMock).toHaveBeenCalledWith("/home")
    })

    it("shows a graceful error (no crash) when the server is unreachable", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
        vi.stubGlobal("fetch", fetchMock)
        const { setUser } = renderSignup()

        await fillAndSubmit()

        expect(
            await screen.findByText("Something went wrong, please try again")
        ).toBeInTheDocument()
        expect(navigateMock).not.toHaveBeenCalled()
        expect(setUser).not.toHaveBeenCalled()
    })

    it("shows a graceful error on a 5xx response", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
        vi.stubGlobal("fetch", fetchMock)
        const { setUser } = renderSignup()

        await fillAndSubmit()

        expect(
            await screen.findByText("Something went wrong, please try again")
        ).toBeInTheDocument()
        expect(setUser).not.toHaveBeenCalled()
    })

    it("surfaces a server status message and does not navigate", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ status: "Username taken" }),
        })
        vi.stubGlobal("fetch", fetchMock)
        const { setUser } = renderSignup()

        await fillAndSubmit()

        expect(await screen.findByText("Username taken")).toBeInTheDocument()
        expect(navigateMock).not.toHaveBeenCalled()
        expect(setUser).not.toHaveBeenCalled()
    })
})
