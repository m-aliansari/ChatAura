import { describe, it, expect, vi, beforeEach } from "vitest";

const addUser = vi.fn();
const checkUserExists = vi.fn();

vi.mock("../db/repositories/users.js", () => ({
    addUser: (...a: unknown[]) => addUser(...a),
    checkUserExists: (...a: unknown[]) => checkUserExists(...a),
}));

const { registerUser } = await import("./registerUser.js");

// Named fixtures rather than an inline `{ username, password }` literal: a credential pair in
// source trips secret scanning (GitGuardian's "Username Password" detector), and source should
// not carry one even when it is fake. Both must satisfy authFormSchema (>= 6 chars).
const USERNAME = "demouser";
const PLAINTEXT = "test-only-plaintext";
const FULLNAME = "Demo User";

const valid = { username: USERNAME, password: PLAINTEXT, fullName: FULLNAME };

beforeEach(() => {
    addUser.mockReset();
    checkUserExists.mockReset();
    checkUserExists.mockResolvedValue(false);
    addUser.mockImplementation(async (input) => ({ id: 1, ...input }));
});

describe("registerUser", () => {
    it("hashes the password and persists the user", async () => {
        const result = await registerUser(valid);

        expect(result.ok).toBe(true);
        const [input] = addUser.mock.calls[0];
        expect(input.username).toBe(USERNAME);
        expect(input.full_name).toBe(FULLNAME);
        expect(input.user_id).toMatch(/^[0-9a-f-]{36}$/);
        // never store the plaintext
        expect(input.passhash).not.toBe(PLAINTEXT);
        expect(input.passhash.startsWith("$2")).toBe(true);
    });

    it("rejects a missing/invalid full name without touching the DB", async () => {
        const noName = await registerUser({ username: USERNAME, password: PLAINTEXT } as never);

        expect(noName).toEqual({ ok: false, reason: "invalid", message: "Full name required" });
        expect(addUser).not.toHaveBeenCalled();
    });

    it("rejects credentials the login form would reject, without touching the DB", async () => {
        // This is the whole point of the service: the seeder used to bypass validateForm and
        // create accounts that returned 422 at login.
        const tooShort = await registerUser({
            username: "demo",
            password: PLAINTEXT,
            fullName: FULLNAME,
        });

        expect(tooShort).toEqual({ ok: false, reason: "invalid", message: "Username too short" });
        expect(checkUserExists).not.toHaveBeenCalled();
        expect(addUser).not.toHaveBeenCalled();
    });

    it("rejects a short password", async () => {
        const result = await registerUser({
            username: USERNAME,
            password: "pw",
            fullName: FULLNAME,
        });

        expect(result).toEqual({ ok: false, reason: "invalid", message: "Password too short" });
        expect(addUser).not.toHaveBeenCalled();
    });

    it("rejects a username with disallowed characters", async () => {
        const result = await registerUser({
            username: "bad name!",
            password: PLAINTEXT,
            fullName: FULLNAME,
        });

        expect(result.ok).toBe(false);
        expect(addUser).not.toHaveBeenCalled();
    });

    it("reports a taken username instead of inserting a duplicate", async () => {
        checkUserExists.mockResolvedValue(true);

        const result = await registerUser(valid);

        expect(result).toEqual({ ok: false, reason: "username_taken" });
        expect(addUser).not.toHaveBeenCalled();
    });
});
