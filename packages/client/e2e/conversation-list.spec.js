import { expect, test } from "./fixtures/app.js";
import { seedFriendship } from "./fixtures/seed.js";

// The sidebar is the "inbox": it shows each friend's FULL NAME (not username) with the last-message
// preview, ordered by latest message — friends with no messages fall back to friendship recency.
test("shows full names + last-message preview, and reorders to the top on a new message", async ({
    request,
    openAppAs,
}) => {
    const uniq = Date.now().toString().slice(-6);
    const aName = `alice${uniq}`;
    const bName = `bobby${uniq}`;
    const cName = `carol${uniq}`;

    // Two friendships for Alice. Bobby is befriended first, Carol second, and neither has messages,
    // so Carol (the newer conversation) starts above Bobby.
    const pair1 = await seedFriendship(request, {
        a: aName,
        b: bName,
        aFullName: "Alice Anderson",
        bFullName: "Bobby Brown",
    });
    await seedFriendship(request, {
        a: aName,
        b: cName,
        aFullName: "Alice Anderson",
        bFullName: "Carol Clark",
    });
    const alice = pair1.a;
    const bobby = pair1.b;

    const pageA = await openAppAs(alice);
    const sidebar = pageA.getByTestId("friends-scroll");

    await test.step("full names are displayed instead of usernames", async () => {
        await expect(sidebar.getByText("Bobby Brown")).toBeVisible();
        await expect(sidebar.getByText("Carol Clark")).toBeVisible();
        // the raw usernames never surface in the list
        await expect(sidebar.getByText(bName, { exact: true })).toHaveCount(0);
        await expect(sidebar.getByText(cName, { exact: true })).toHaveCount(0);
    });

    await test.step("with no messages, the most recently added friend sorts first", async () => {
        await expect(sidebar.getByRole("tab").first()).toContainText("Carol Clark");
    });

    await test.step("a new message moves that conversation to the top, with a preview", async () => {
        const pageB = await openAppAs(bobby);
        await pageB.getByRole("tab", { name: "Alice Anderson" }).click();
        await pageB.getByPlaceholder("Type message here...").fill("dinner at 8?");
        await pageB.getByRole("button", { name: "Send" }).click();

        // Alice's list: Bobby jumps to the top and shows the preview text.
        await expect(sidebar.getByText("dinner at 8?")).toBeVisible();
        await expect(sidebar.getByRole("tab").first()).toContainText("Bobby Brown");
        await expect(sidebar.getByRole("tab").first()).toContainText("dinner at 8?");
    });
});
