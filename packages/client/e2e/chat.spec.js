import { expect, test } from "./fixtures/app.js";
import { seedFriendship } from "./fixtures/seed.js";

test("typing indicator shows while UserA types and clears when they stop", async ({
    request,
    openAppAs,
}) => {
    const { a, b } = await seedFriendship(request);

    const pageA = await openAppAs(a);
    const pageB = await openAppAs(b);

    // Both users open the conversation with each other so the indicator is
    // allowed to render (sender emit target + receiver active-tab gate).
    await pageA.getByRole("tab", { name: b.username }).click();
    await pageB.getByRole("tab", { name: a.username }).click();

    // Install fake timers AFTER the socket is connected so only the 2s typing
    // debounce is faked, not socket.io's heartbeat.
    await pageA.clock.install();

    const indicator = pageB.getByText(`${a.username} is typing`);

    await test.step("appears on first keystroke", async () => {
        await pageA.getByPlaceholder("Type message here...").pressSequentially("hello");
        await expect(indicator).toBeVisible();
    });

    await test.step("clears after the 2s idle window (advanced instantly)", async () => {
        await pageA.clock.runFor(2000); // fire the debounce -> STOP_TYPING
        await expect(indicator).toBeHidden(); // resolves immediately on success
    });
});

test("typing indicator clears if UserA sends a message", async ({ request, openAppAs }) => {
    const { a, b } = await seedFriendship(request);

    const pageA = await openAppAs(a);
    const pageB = await openAppAs(b);

    // Both users open the conversation with each other so the indicator is
    // allowed to render (sender emit target + receiver active-tab gate).
    await pageA.getByRole("tab", { name: b.username }).click();
    await pageB.getByRole("tab", { name: a.username }).click();

    const indicator = pageB.getByText(`${a.username} is typing`);

    await pageA.getByPlaceholder("Type message here...").pressSequentially("hello");
    await expect(indicator).toBeVisible();

    pageA.getByRole("button", { name: "Send" }).click();
    await expect(indicator).toBeHidden();
});

test("UserA can send a message to UserB and it appears in UserB's chat window", async ({
    request,
    openAppAs,
}) => {
    const { a, b } = await seedFriendship(request);

    const pageA = await openAppAs(a);
    const pageB = await openAppAs(b);

    // Both users open the conversation with each other so the indicator is
    // allowed to render (sender emit target + receiver active-tab gate).
    await pageA.getByRole("tab", { name: b.username }).click();
    await pageB.getByRole("tab", { name: a.username }).click();

    const message = "Hello, UserB!";
    await pageA.getByPlaceholder("Type message here...").fill(message);
    await pageA.getByRole("button", { name: "Send" }).click();

    // Scope to the conversation pane: the message text also appears in the sidebar now, as that
    // conversation's last-message preview, so an unscoped getByText matches two elements.
    const messageInB = pageB.getByTestId(`messages-scroll:${a.user_id}`).getByText(message);
    await expect(messageInB).toBeVisible();
});

test("a user receives messages sent while they were offline, on next login", async ({
    request,
    openAppAs,
}) => {
    const { a, b } = await seedFriendship(request);

    // Only UserA is online; UserB never opens the app, so he is offline.
    const pageA = await openAppAs(a);

    const message = "sent while UserB was offline";
    await pageA.getByRole("tab", { name: b.username }).click();
    await pageA.getByPlaceholder("Type message here...").fill(message);
    await pageA.getByRole("button", { name: "Send" }).click();

    // UserB logs in later and should see the message waiting in the conversation.
    const pageB = await openAppAs(b);
    await pageB.getByRole("tab", { name: a.username }).click();
    // Scoped to the conversation pane — the sidebar preview shows the same text.
    await expect(
        pageB.getByTestId(`messages-scroll:${a.user_id}`).getByText(message),
    ).toBeVisible();
});
