import { describe, it, expect } from "vitest";
import {
    authFormSchema,
    friendFormSchema,
    registerCredentialsSchema,
    registerFormSchema,
    messageFormSchema,
    appName,
    SOCKET_EVENTS,
    API_ROUTES,
} from "./index.js";

describe("authFormSchema", () => {
    it("accepts a valid username/password", async () => {
        await expect(
            authFormSchema.validate({ username: "validuser", password: "secret123" }),
        ).resolves.toEqual({ username: "validuser", password: "secret123" });
    });

    it("rejects a missing username", async () => {
        await expect(authFormSchema.validate({ password: "secret123" })).rejects.toThrow(
            "Username required",
        );
    });

    it("rejects a missing password", async () => {
        await expect(authFormSchema.validate({ username: "validuser" })).rejects.toThrow(
            "Password required",
        );
    });

    it("enforces the 6-char minimum on username", async () => {
        await expect(
            authFormSchema.validate({ username: "short", password: "secret123" }),
        ).rejects.toThrow("Username too short");
    });

    it("accepts exactly 6 chars on username (boundary)", async () => {
        await expect(
            authFormSchema.validate({ username: "sixsix", password: "secret123" }),
        ).resolves.toBeTruthy();
    });

    it("enforces the 28-char maximum on username", async () => {
        await expect(
            authFormSchema.validate({ username: "a".repeat(29), password: "secret123" }),
        ).rejects.toThrow("Username too long");
    });

    it("accepts exactly 28 chars on username (boundary)", async () => {
        await expect(
            authFormSchema.validate({ username: "a".repeat(28), password: "secret123" }),
        ).resolves.toBeTruthy();
    });

    it("enforces the 6-char minimum on password", async () => {
        await expect(
            authFormSchema.validate({ username: "validuser", password: "abc" }),
        ).rejects.toThrow("Password too short");
    });

    it("enforces the 28-char maximum on password", async () => {
        await expect(
            authFormSchema.validate({ username: "validuser", password: "a".repeat(29) }),
        ).rejects.toThrow("Password too long");
    });
});

describe("friendFormSchema", () => {
    it("validates username only and ignores password", async () => {
        const result = await friendFormSchema.validate({ username: "frienduser" });
        expect(result).toEqual({ username: "frienduser" });
        expect(result).not.toHaveProperty("password");
    });

    it("still requires a username", async () => {
        await expect(friendFormSchema.validate({})).rejects.toThrow("Username required");
    });

    it("still enforces the username length rules", async () => {
        await expect(friendFormSchema.validate({ username: "shrt" })).rejects.toThrow(
            "Username too short",
        );
    });
});

// Named fixtures rather than an inline `{ username, password }` literal: a credential *pair* bound
// to a variable trips secret scanning (GitGuardian's "Username Password" detector), and source
// should not carry one even when it is fake. Same discipline as services/registerUser.test.ts.
const USERNAME = "validuser";
const PLAINTEXT = "secret123";
const FULLNAME = "Ada Lovelace";

describe("registerCredentialsSchema", () => {
    const base = { username: USERNAME, password: PLAINTEXT };

    it("accepts username + password + full name", async () => {
        await expect(
            registerCredentialsSchema.validate({ ...base, fullName: "Ada Lovelace" }),
        ).resolves.toEqual({ ...base, fullName: "Ada Lovelace" });
    });

    it("requires a full name", async () => {
        await expect(registerCredentialsSchema.validate(base)).rejects.toThrow(
            "Full name required",
        );
    });

    it("enforces the 2-char minimum on full name", async () => {
        await expect(
            registerCredentialsSchema.validate({ ...base, fullName: "A" }),
        ).rejects.toThrow("Full name too short");
    });

    it("enforces the 60-char maximum on full name", async () => {
        await expect(
            registerCredentialsSchema.validate({ ...base, fullName: "a".repeat(61) }),
        ).rejects.toThrow("Full name too long");
    });

    it("rejects disallowed characters in the full name", async () => {
        await expect(
            registerCredentialsSchema.validate({ ...base, fullName: "Ada <script>" }),
        ).rejects.toThrow("Full name can only contain");
    });

    it("accepts unicode letters, spaces, apostrophes and hyphens", async () => {
        await expect(
            registerCredentialsSchema.validate({ ...base, fullName: "José O'Brien-Núñez" }),
        ).resolves.toBeTruthy();
    });

    it("rejects leading/trailing whitespace (strict, no coercion)", async () => {
        await expect(
            registerCredentialsSchema.validate({ ...base, fullName: " Ada " }),
        ).rejects.toThrow("Full name cannot contain leading or trailing whitespace");
    });

    it("does not declare confirmPassword — it is a form-only concern, enforced elsewhere", () => {
        // Yup passes unknown keys through rather than stripping them, so validate() would echo a
        // stray confirmPassword. Persistence is prevented not by the schema but by `registerUser`,
        // which builds the insert from username/password/fullName only. Guard the schema shape:
        expect(Object.keys(registerCredentialsSchema.fields).sort()).toEqual([
            "fullName",
            "password",
            "username",
        ]);
    });
});

describe("registerFormSchema", () => {
    const full = {
        username: USERNAME,
        password: PLAINTEXT,
        fullName: FULLNAME,
        confirmPassword: PLAINTEXT,
    };

    it("accepts a fully matching registration form", async () => {
        await expect(registerFormSchema.validate(full)).resolves.toEqual(full);
    });

    it("requires confirmPassword", async () => {
        const { confirmPassword: _omit, ...withoutConfirm } = full;
        await expect(registerFormSchema.validate(withoutConfirm)).rejects.toThrow(
            "Confirm your password",
        );
    });

    it("rejects a mismatched confirmPassword", async () => {
        await expect(
            registerFormSchema.validate({ ...full, confirmPassword: "different1" }),
        ).rejects.toThrow("Passwords must match");
    });
});

describe("authFormSchema is unaffected by the register schemas", () => {
    it("still accepts exactly username + password (no fullName leak)", async () => {
        const credentials = { username: USERNAME, password: PLAINTEXT };
        await expect(authFormSchema.validate(credentials)).resolves.toEqual(credentials);
    });

    it("friendFormSchema still validates username only", async () => {
        await expect(friendFormSchema.validate({ username: "frienduser" })).resolves.toEqual({
            username: "frienduser",
        });
    });
});

describe("messageFormSchema", () => {
    it("accepts a normal message", async () => {
        await expect(messageFormSchema.validate({ message: "hello there" })).resolves.toEqual({
            message: "hello there",
        });
    });

    it("rejects an empty/missing message", async () => {
        await expect(messageFormSchema.validate({})).rejects.toThrow("Message required");
    });

    it("accepts exactly 255 chars (boundary)", async () => {
        await expect(
            messageFormSchema.validate({ message: "a".repeat(255) }),
        ).resolves.toBeTruthy();
    });

    it("rejects messages longer than 255 chars", async () => {
        await expect(messageFormSchema.validate({ message: "a".repeat(256) })).rejects.toThrow(
            "Max length is 255",
        );
    });
});

describe("constants", () => {
    it("exposes the app name", () => {
        expect(appName).toBe("realtime-chatapp");
    });

    it("SOCKET_EVENTS values are unique (no accidental dupes)", () => {
        const values = Object.values(SOCKET_EVENTS);
        expect(new Set(values).size).toBe(values.length);
    });

    it("SOCKET_EVENTS values are all non-empty strings", () => {
        for (const value of Object.values(SOCKET_EVENTS)) {
            expect(typeof value).toBe("string");
            expect(value.length).toBeGreaterThan(0);
        }
    });

    it("DISCONNECT maps to socket.io's 'disconnecting' event", () => {
        // The grace-period logic depends on this being the pre-disconnect event.
        expect(SOCKET_EVENTS.DISCONNECT).toBe("disconnecting");
    });

    it("API_ROUTES full paths compose BASE + SPECIFIC sub-paths", () => {
        expect(API_ROUTES.AUTH.LOGIN).toBe(API_ROUTES.AUTH.BASE + API_ROUTES.AUTH.SPECIFIC.LOGIN);
        expect(API_ROUTES.AUTH.REGISTER).toBe(
            API_ROUTES.AUTH.BASE + API_ROUTES.AUTH.SPECIFIC.REGISTER,
        );
        expect(API_ROUTES.FCM.TOKEN.SAVE).toBe(
            API_ROUTES.FCM.BASE + API_ROUTES.FCM.SPECIFIC.TOKEN.SAVE,
        );
        expect(API_ROUTES.FCM.TOKEN.DELETE).toBe(
            API_ROUTES.FCM.BASE + API_ROUTES.FCM.SPECIFIC.TOKEN.DELETE,
        );
        expect(API_ROUTES.FCM.MESSAGE).toBe(API_ROUTES.FCM.BASE + API_ROUTES.FCM.SPECIFIC.MESSAGE);
    });
});
