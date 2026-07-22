import { test as base, expect } from "@playwright/test";
import { contextAs } from "./seed.js";

export const test = base.extend({
    openAppAs: async ({ browser }, use) => {
        const contexts = [];

        const openAppAs = async (user) => {
            const context = await contextAs(browser, user);
            contexts.push(context);
            const page = await context.newPage();
            await page.goto("/");
            // "Account" is the stable authenticated-home signal: it is always present in the
            // sidebar header, unlike Logout (now inside that menu) or the old "Add Friend" heading.
            // `exact` is REQUIRED: getByRole name matching is substring by default, so a bare
            // "Account" also matches the login page's "Create Account" button.
            await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();

            return page;
        };

        await use(openAppAs);

        // teardown — runs even if the test fails
        for (const context of contexts) await context.close();
    },
});

export { expect };
