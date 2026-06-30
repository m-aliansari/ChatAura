import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { UserContext } from "../contexts/User/UserContext.js";
import { useAuth } from "./useAuth.jsx";

const wrapperWith = (user) =>
    function Wrapper({ children }) {
        return <UserContext.Provider value={{ user }}>{children}</UserContext.Provider>;
    };

describe("useAuth", () => {
    it("is truthy when the user is logged in", () => {
        const { result } = renderHook(() => useAuth(), {
            wrapper: wrapperWith({ loggedIn: true, username: "alice" }),
        });
        expect(result.current).toBe(true);
    });

    it("is falsy when the user is not logged in", () => {
        const { result } = renderHook(() => useAuth(), {
            wrapper: wrapperWith({ loggedIn: false }),
        });
        expect(result.current).toBe(false);
    });

    it("is falsy when there is no user", () => {
        const { result } = renderHook(() => useAuth(), {
            wrapper: wrapperWith(null),
        });
        expect(result.current).toBeFalsy();
    });
});
