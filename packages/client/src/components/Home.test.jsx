import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/renderWithProviders.jsx";

// Home wires up the socket and pulls in the full SideBar/ChatMessages subtrees
// (each needs several contexts). Stub them so the test targets Home's own
// responsive layout logic — specifically the mobile slide track.
vi.mock("../hooks/useSocketSetup.jsx", () => ({ useSocketSetup: vi.fn() }));
vi.mock("./Chat/FriendList/SideBar.jsx", () => ({
    SideBar: () => <div data-testid="sidebar" />,
}));
vi.mock("./Chat/ChatMessages.jsx", () => ({
    // Mirrors the real prop contract: only the mobile branch passes onBack.
    ChatMessages: ({ onBack }) => (
        <div data-testid="chat">{onBack && <button onClick={onBack}>back</button>}</div>
    ),
}));

const bp = vi.hoisted(() => ({ mobile: true }));
vi.mock("@chakra-ui/react", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useBreakpointValue: () => bp.mobile };
});

// Static import: vi.mock calls are hoisted above it, and importing statically
// (not via a dynamic import) is what lets v8 attribute coverage to Home.jsx.
import { Home } from "./Home.jsx";

// The slide track is the flex wrapping the two 50%-wide panes: sidebar -> its
// pane Box -> the track.
const track = () => screen.getByTestId("sidebar").parentElement.parentElement;

beforeEach(() => {
    bp.mobile = true;
});

describe("Home mobile layout", () => {
    it("mounts both panes in a single track so they can slide", () => {
        renderWithProviders(<Home />, { route: "/home" });

        expect(screen.getByTestId("sidebar")).toBeInTheDocument();
        expect(screen.getByTestId("chat")).toBeInTheDocument();
    });

    it("moves the track when a chat is open vs. the friend list", async () => {
        const { unmount } = renderWithProviders(<Home />, { route: "/home" });
        const listTransform = track().className;
        unmount();

        // Opening a chat is driven by the ?userId= param -> tabs.setValue.
        renderWithProviders(<Home />, { route: "/home?userId=u1" });
        await waitFor(() => expect(track().className).not.toBe(listTransform));
    });

    it("slides back to the list when Back is pressed", async () => {
        renderWithProviders(<Home />, { route: "/home?userId=u1" });

        const openTransform = await waitFor(() => {
            const cls = track().className;
            // wait until the open-chat transform has been applied
            expect(screen.getByText("back")).toBeInTheDocument();
            return cls;
        });

        await userEvent.click(screen.getByText("back"));

        await waitFor(() => expect(track().className).not.toBe(openTransform));
    });
});

describe("Home desktop layout", () => {
    it("renders both panes side by side without a Back button", () => {
        bp.mobile = false;
        renderWithProviders(<Home />, { route: "/home" });

        expect(screen.getByTestId("sidebar")).toBeInTheDocument();
        expect(screen.getByTestId("chat")).toBeInTheDocument();
        expect(screen.queryByText("back")).not.toBeInTheDocument();
    });
});
