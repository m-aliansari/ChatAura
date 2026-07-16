import { expect } from "@playwright/test";

// Path where the setup project persists an authenticated session (cookies +
// localStorage, which holds the JWT). Authenticated specs reuse this via the
// `chromium-authed` project's `storageState`.
export const STORAGE_STATE = "playwright/.auth/user.json";

let seq = 0;
// Unique-enough names within a single E2E run (one fresh DB per run).
export const uniq = (base) => `${base}${Date.now().toString().slice(-6)}${seq++}`;

/**
 * Registers a new user through the UI and lands on the authenticated home.
 *
 * NOTE the `exact: true` on the password field: getByPlaceholder matches by substring, so a plain
 * "Enter password" also matches "Re-**enter password**" and trips strict mode.
 */
export async function register(page, username, password = "secret1", fullName = "Test User") {
    await page.goto("/#/register");
    await page.getByPlaceholder("Enter your full name").fill(fullName);
    await page.getByPlaceholder("Enter username").fill(username);
    await page.getByPlaceholder("Enter password", { exact: true }).fill(password);
    await page.getByPlaceholder("Re-enter password").fill(password);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByRole("heading", { name: "Add Friend" })).toBeVisible();
}

/** Logs an existing user in through the UI and lands on the authenticated home. */
export async function loginAs(page, username, password = "secret1") {
    await page.goto("/");
    await page.getByPlaceholder("Enter username").fill(username);
    await page.getByPlaceholder("Enter password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("heading", { name: "Add Friend" })).toBeVisible();
}
