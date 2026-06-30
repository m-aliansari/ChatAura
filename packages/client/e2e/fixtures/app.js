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
            await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
            
            return page;
        };

        await use(openAppAs);

        // teardown — runs even if the test fails
        for (const context of contexts) await context.close();
    },
});

export { expect };