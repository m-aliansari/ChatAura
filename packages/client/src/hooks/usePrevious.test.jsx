import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePrevious } from "./usePrevious.jsx";

describe("usePrevious", () => {
    it("returns undefined on the first render", () => {
        const { result } = renderHook(() => usePrevious("a"));
        expect(result.current).toBeUndefined();
    });

    it("returns the value from the previous render after an update", () => {
        const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
            initialProps: { value: "first" },
        });
        expect(result.current).toBeUndefined();

        rerender({ value: "second" });
        expect(result.current).toBe("first");

        rerender({ value: "third" });
        expect(result.current).toBe("second");
    });
});
