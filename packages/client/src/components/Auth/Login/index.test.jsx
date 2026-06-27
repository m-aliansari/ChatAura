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

const { Login } = await import("./index.jsx")

function renderLogin(setUser = vi.fn()) {
    renderWithProviders(
        <UserContext.Provider value={{ setUser }}>
            <Login />
        </UserContext.Provider>
    )
    return { setUser }
}

async function fillAndSubmit() {
    await userEvent.type(screen.getByPlaceholderText("Enter username"), "alice1")
    await userEvent.type(screen.getByPlaceholderText("Enter password"), "secret1")
    await userEvent.click(screen.getByRole("button", { name: "Log In" }))
}

describe("Login", () => {
    beforeEach(() => {
        navigateMock.mockClear()
        localStorage.clear()
        vi.restoreAllMocks()
    })

    it("POSTs credentials to the login endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ token: "jwt-1", loggedIn: true }),
        })
        vi.stubGlobal("fetch", fetchMock)
        renderLogin()

        await fillAndSubmit()

        await waitFor(() => expect(fetchMock).toHaveBeenCalled())
        const [url, opts] = fetchMock.mock.calls[0]
        expect(url).toBe("http://localhost:3000/auth/login")
        expect(opts.method).toBe("POST")
        expect(JSON.parse(opts.body)).toEqual({ username: "alice1", password: "secret1" })
    })

    it("stores the token, sets the user, and navigates home on success", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ token: "jwt-1", loggedIn: true }),
        })
        vi.stubGlobal("fetch", fetchMock)
        const { setUser } = renderLogin()

        await fillAndSubmit()

        await waitFor(() => expect(setUser).toHaveBeenCalled())
        expect(localStorage.getItem("token")).toBe("jwt-1")
        expect(setUser).toHaveBeenCalledWith({ token: "jwt-1", loggedIn: true })
        expect(navigateMock).toHaveBeenCalledWith("/home")
    })

    it("shows the server status as an error and does not navigate on failure", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ status: "Invalid credentials" }),
        })
        vi.stubGlobal("fetch", fetchMock)
        const { setUser } = renderLogin()

        await fillAndSubmit()

        expect(await screen.findByText("Invalid credentials")).toBeInTheDocument()
        expect(navigateMock).not.toHaveBeenCalled()
        expect(setUser).not.toHaveBeenCalled()
        expect(localStorage.getItem("token")).toBeNull()
    })

    it("shows a graceful error (no crash) when the server is unreachable", async () => {
        // fetch rejects -> the .catch must set a STRING, not an Error object
        // (rendering an Error as a React child throws).
        const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
        vi.stubGlobal("fetch", fetchMock)
        const { setUser } = renderLogin()

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
        const { setUser } = renderLogin()

        await fillAndSubmit()

        expect(
            await screen.findByText("Something went wrong, please try again")
        ).toBeInTheDocument()
        expect(setUser).not.toHaveBeenCalled()
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it("does not submit when validation fails (username too short)", async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        renderLogin()

        await userEvent.type(screen.getByPlaceholderText("Enter username"), "abc")
        await userEvent.type(screen.getByPlaceholderText("Enter password"), "secret1")
        await userEvent.click(screen.getByRole("button", { name: "Log In" }))

        await waitFor(() => expect(screen.getByText("Username too short")).toBeInTheDocument())
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("does not submit a whitespace-only username", async () => {
        // SPEC: "      " is not a valid username. (Schema accepts 6 spaces today.)
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        renderLogin()

        await userEvent.type(screen.getByPlaceholderText("Enter username"), "      ")
        await userEvent.type(screen.getByPlaceholderText("Enter password"), "secret1")
        await userEvent.click(screen.getByRole("button", { name: "Log In" }))

        await new Promise((r) => setTimeout(r, 50))
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
