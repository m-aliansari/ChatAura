import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useContext } from "react";
import { UserContext } from "./UserContext.js";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
    ...(await orig()),
    useNavigate: () => navigateMock,
}));
vi.mock("firebase/messaging", () => ({
    getToken: vi.fn().mockResolvedValue("fcm-token"),
}));
vi.mock("../../utils/firebase.js", () => ({ messaging: {} }));

const UserContextProvider = (await import("./UserContextProvider.jsx")).default;

function Probe() {
    const { user } = useContext(UserContext);
    return <div data-testid="state">{String(user?.loggedIn)}</div>;
}

function renderProvider() {
    return render(
        <MemoryRouter>
            <UserContextProvider>
                <Probe />
            </UserContextProvider>
        </MemoryRouter>,
    );
}

describe("UserContextProvider auth bootstrap", () => {
    beforeEach(() => {
        navigateMock.mockClear();
        localStorage.setItem("token", "jwt-1");
        vi.restoreAllMocks();
    });

    it("logs the user in and navigates home when the token is valid", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ loggedIn: true, token: "jwt-1", username: "alice" }),
            }),
        );

        renderProvider();

        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("true"));
        expect(navigateMock).toHaveBeenCalledWith("/home");
    });

    it("clears the token and sets loggedIn:false when the token check fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));

        renderProvider();

        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("false"));
        expect(localStorage.getItem("token")).toBeNull();
        expect(navigateMock).not.toHaveBeenCalled();
    });
});
