import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { UserContext } from "../contexts/User/UserContext.js"
import { PrivateRoutes } from "./PrivateRoutes.jsx"

function renderAt(user) {
    return render(
        <UserContext.Provider value={{ user }}>
            <MemoryRouter initialEntries={["/home"]}>
                <Routes>
                    <Route element={<PrivateRoutes />}>
                        <Route path="/home" element={<div>Protected Home</div>} />
                    </Route>
                    <Route path="/" element={<div>Login Page</div>} />
                </Routes>
            </MemoryRouter>
        </UserContext.Provider>
    )
}

describe("PrivateRoutes", () => {
    it("renders the protected outlet when authenticated", () => {
        renderAt({ loggedIn: true })
        expect(screen.getByText("Protected Home")).toBeInTheDocument()
    })

    it("redirects to login when not authenticated", () => {
        renderAt({ loggedIn: false })
        expect(screen.getByText("Login Page")).toBeInTheDocument()
        expect(screen.queryByText("Protected Home")).not.toBeInTheDocument()
    })
})
