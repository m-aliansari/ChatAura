import { expect, test } from "./fixtures/app.js";
import { seedFriendship, seedUser } from "./fixtures/seed.js";

test("Added friends render on both users' friend lists", async ({ request, openAppAs }) => {
    const userA = await seedUser(request);
    const userB = await seedUser(request);

    const pageA = await openAppAs(userA);
    const pageB = await openAppAs(userB);

    await pageA.getByRole("button", { name: "Add Friend" }).click();
    await expect(pageA.getByRole("dialog", { name: "Add a friend!" })).toBeVisible();
    await pageA.getByPlaceholder("Enter Friend's username").fill(userB.username);
    await pageA.getByRole("button", { name: "Submit" }).click();
    await expect(pageA.getByRole("tab", { name: userB.username })).toBeVisible();

    await expect(pageB.getByRole("tab", { name: userA.username })).toBeVisible();
});

test("when a friend is removed, both users' friend lists update in realtime", async ({
    request,
    openAppAs,
}) => {
    const { a, b } = await seedFriendship(request);

    const pageA = await openAppAs(a);
    await expect(pageA.getByRole("tab", { name: b.username })).toBeVisible();

    const pageB = await openAppAs(b);
    await expect(pageB.getByRole("tab", { name: a.username })).toBeVisible();

    await test.step("userA removes userB as a friend", async () => {
        await pageA.getByRole("button", { name: `Remove ${b.username}` }).click();

        const dialog = pageA.getByRole("dialog", { name: `Remove ${b.username}?` });
        await expect(dialog).toBeVisible();

        await dialog.getByRole("button", { name: "Remove", exact: true }).click(); // CONFIRM
        await expect(dialog).toBeHidden();

        await expect(pageA.getByRole("tab", { name: b.username })).toHaveCount(0);
    });

    await test.step("userB sees userA disappear from his friend list without reloading", async () => {
        await expect(pageB.getByRole("tab", { name: a.username })).toHaveCount(0);
    });
});

test("Friends' statuses update in realtime", async ({ request, openAppAs }) => {
    const { a, b } = await seedFriendship(request);

    const pageA = await openAppAs(a);

    const userBTab = pageA.getByRole("tab", { name: b.username });
    await expect(userBTab).toBeVisible();

    await test.step("userB appears offline when offline", async () => {
        await expect(userBTab.locator("[data-status]")).toHaveAttribute("data-status", "offline");
    });

    const pageB = await openAppAs(b);

    await test.step("userB appears online when he visits the app", async () => {
        await expect(userBTab.locator("[data-status]")).toHaveAttribute("data-status", "online");
    });

    await test.step("userB appears offline when he closes the app", async () => {
        await pageB.context().close();
        await expect(userBTab.locator("[data-status]")).toHaveAttribute("data-status", "offline");
    });

    const pageC = await openAppAs(b);

    await expect(userBTab.locator("[data-status]")).toHaveAttribute("data-status", "online");

    await test.step("userB appears offline when he logs out", async () => {
        await pageC.getByRole("button", { name: "Logout" }).click();
        await expect(userBTab.locator("[data-status]")).toHaveAttribute("data-status", "offline");
    });
});
