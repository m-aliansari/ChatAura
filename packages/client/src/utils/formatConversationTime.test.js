import { describe, it, expect } from "vitest";
import { formatConversationTime } from "./formatConversationTime.js";

const daysAgo = (n, hour = 12) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(hour, 5, 0, 0);
    return d.toISOString();
};

describe("formatConversationTime", () => {
    it("returns '' for missing / invalid input", () => {
        expect(formatConversationTime("")).toBe("");
        expect(formatConversationTime(null)).toBe("");
        expect(formatConversationTime("not-a-date")).toBe("");
    });

    it("shows a clock time for today", () => {
        const result = formatConversationTime(daysAgo(0));
        expect(result).toMatch(/\d/); // a time, e.g. "12:05 PM"
        expect(result).not.toBe("Yesterday");
    });

    it("shows 'Yesterday' for one day ago", () => {
        expect(formatConversationTime(daysAgo(1))).toBe("Yesterday");
    });

    it("shows a weekday earlier this week", () => {
        const result = formatConversationTime(daysAgo(3));
        expect(result).not.toBe("Yesterday");
        expect(result.length).toBeGreaterThan(0);
        // A weekday abbreviation contains letters, not a colon.
        expect(result).not.toContain(":");
    });

    it("shows a short date for older messages", () => {
        const result = formatConversationTime(daysAgo(30));
        expect(result).not.toContain(":");
        expect(result.length).toBeGreaterThan(0);
    });
});
