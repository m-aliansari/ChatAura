import { expect, test } from "./fixtures/app.js";
import { seedFriendship, seedFriends, seedMessages } from "./fixtures/seed.js";

// Scroll-DRIVEN pagination, exercised in a real browser. This is the gap that let a CSS height
// regression through every other tier: when the sidebar's height chain broke, the whole PAGE
// scrolled instead of the list, so the list's onScroll never fired and LOAD_MORE_FRIENDS never ran —
// yet the unit test passed (it dispatches a synthetic scroll in jsdom, which has no layout) and no
// other E2E ever scrolls. These two tests assert the loads actually happen from real wheel input.
//
// Real wheel events (not element.scrollTop) are used deliberately: the message list is a
// `column-reverse` flex container, and the sign of scrollTop there differs across Chromium/Firefox/
// WebKit — wheel deltas are interpreted consistently, so one test drives all three engines.

test("sidebar loads more conversations on scroll (LOAD_MORE_FRIENDS)", async ({
    request,
    openAppAs,
}) => {
    // 18 friends > FRIENDS_PAGE_SIZE (15): the first page is 15, scrolling must load the remaining 3.
    const { a } = await seedFriends(request, {
        a: `scroller${Date.now().toString().slice(-6)}`,
        count: 18,
    });

    const page = await openAppAs(a);
    const sidebar = page.getByTestId("friends-scroll");

    // Only the first page is present initially.
    await expect(page.getByRole("tab")).toHaveCount(15);

    // Scroll down; poll because one wheel tick may not reach the load threshold on every engine.
    await expect
        .poll(
            async () => {
                await sidebar.hover();
                await page.mouse.wheel(0, 4000);
                await page.waitForTimeout(200);
                return page.getByRole("tab").count();
            },
            {
                timeout: 15_000,
                message: "sidebar never loaded past the first page of conversations",
            },
        )
        .toBe(18);
});

test("conversation loads older messages on scroll-up (LOAD_OLDER)", async ({
    request,
    openAppAs,
}) => {
    const marker = `OLDEST-${Date.now().toString().slice(-6)}`;
    const { a, b } = await seedFriendship(request);
    // 35 messages > MESSAGES_PAGE_SIZE (30): the oldest message (the marker) is NOT in the first page.
    await seedMessages(request, {
        from: b.username,
        to: a.username,
        count: 35,
        oldestMarker: marker,
    });

    const page = await openAppAs(a);
    await page.getByRole("tab", { name: b.username }).click();

    const pane = page.getByTestId(`messages-scroll:${b.user_id}`);
    // The newest message is loaded on connect (confirms the conversation opened)...
    await expect(pane.getByText("seed message 35", { exact: true })).toBeVisible();
    // ...but the oldest is beyond the first page and must not be present yet.
    await expect(pane.getByText(marker, { exact: true })).toHaveCount(0);

    // Scroll up toward the oldest edge (negative deltaY) until the older page loads in.
    await expect
        .poll(
            async () => {
                await pane.hover();
                await page.mouse.wheel(0, -4000);
                await page.waitForTimeout(200);
                return pane.getByText(marker, { exact: true }).count();
            },
            { timeout: 15_000, message: "older messages never loaded on scroll-up" },
        )
        .toBeGreaterThan(0);
});
