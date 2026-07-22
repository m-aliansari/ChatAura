import { test, expect } from "@playwright/test";
import { register, loginAs, uniq } from "./fixtures/auth.js";

test("a new user can register and reach the authenticated home (full stack)", async ({ page }) => {
    await register(page, uniq("solo"));
    // Sidebar controls render -> client+server+Postgres+JWT+socket all wired.
    await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();
});

test("an existing user can log in", async ({ browser }) => {
    const username = uniq("login");

    // Create the account in one context...
    const ctx1 = await browser.newContext();
    const p1 = await ctx1.newPage();
    await register(p1, username);
    await ctx1.close();

    // ...then log in fresh (no stored token) in another context.
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await loginAs(p2, username);
    await expect(p2.getByRole("button", { name: "Account", exact: true })).toBeVisible();
    await ctx2.close();
});

test("invalid login shows an error and stays on the login page", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Enter username").fill("nobody1");
    await page.getByPlaceholder("Enter password").fill("wrongpass");
    await page.getByRole("button", { name: "Log In" }).click();

    await expect(page.getByText("Wrong username or password!")).toBeVisible();
    await expect(page.getByRole("button", { name: "Account", exact: true })).toHaveCount(0);
});
