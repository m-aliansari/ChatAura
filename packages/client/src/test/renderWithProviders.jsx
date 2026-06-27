import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { Provider } from "../components/ui/provider.jsx"

/**
 * Renders a component inside the app's Chakra Provider + a router, so Chakra
 * components and react-router hooks (useNavigate, Link) work in tests.
 */
export function renderWithProviders(ui, { route = "/", ...options } = {}) {
    return render(ui, {
        wrapper: ({ children }) => (
            <Provider>
                <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
            </Provider>
        ),
        ...options,
    })
}
