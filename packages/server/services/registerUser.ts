import { hash } from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { ValidationError } from "yup";
import { registerCredentialsSchema } from "@realtime-chatapp/common";
import { addUser, checkUserExists } from "../db/repositories/users.js";
import type { User } from "../db/schema/users.js";

export const BCRYPT_ROUNDS = 10;

/**
 * Creating a user is a *domain* operation, not an HTTP one. Its preconditions therefore live
 * here rather than in Express middleware: `validateForm` only guards requests, so any other
 * entry point (the dev seeder, a CLI, a queue consumer) would otherwise write straight through
 * `addUser` and create an account that cannot log in — the credential rules are Yup-only, and
 * nothing at the DB level enforces them.
 *
 * The rule itself is NOT duplicated: this validates against `registerCredentialsSchema`, the same
 * source of truth the route middleware's `registerFormSchema` builds on (it just adds the form-only
 * `confirmPassword`). Enforcing at several boundaries is fine; defining the rule twice is not.
 *
 * Returns a result union rather than throwing, so callers map outcomes to their own transport
 * (an HTTP status, a seeder error) without treating exceptions as control flow.
 */
export type RegisterUserResult =
    | { ok: true; user: User }
    | { ok: false; reason: "invalid"; message: string }
    | { ok: false; reason: "username_taken" };

export const registerUser = async (credentials: {
    username: string;
    password: string;
    fullName: string;
}): Promise<RegisterUserResult> => {
    let valid: { username: string; password: string; fullName: string };
    try {
        valid = await registerCredentialsSchema.validate(credentials);
    } catch (error) {
        const message =
            error instanceof ValidationError ? error.errors[0] : "Invalid registration details";
        return { ok: false, reason: "invalid", message };
    }

    if (await checkUserExists(valid.username)) return { ok: false, reason: "username_taken" };

    const passhash = await hash(valid.password, BCRYPT_ROUNDS);
    const user = await addUser({
        user_id: uuidv4(),
        username: valid.username,
        full_name: valid.fullName,
        passhash,
    });

    return { ok: true, user };
};
