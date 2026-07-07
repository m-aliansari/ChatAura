import { eq } from "drizzle-orm";
import { db } from "../index.js";
import { users } from "../schema/users.js";
import type { User } from "../schema/users.js";

export const getUserByUsername = async (username: string): Promise<User | undefined> => {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
};

export const getUserByUserId = async (userId: string): Promise<User | undefined> => {
    const [user] = await db.select().from(users).where(eq(users.user_id, userId)).limit(1);
    return user;
};

/** Existence check that never throws — a DB error is swallowed as `false`, preserving the
 *  fail-open-then-let-the-UNIQUE-constraint-decide behaviour used by register/check-login. */
export const checkUserExists = async (username: string): Promise<boolean> => {
    try {
        const [user] = await db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.username, username))
            .limit(1);
        return user !== undefined;
    } catch (error) {
        console.log("error in checkUserExists");
        console.log(error);
        return false;
    }
};

export const addUser = async (input: {
    user_id: string;
    username: string;
    passhash: string;
}): Promise<User> => {
    const [user] = await db.insert(users).values(input).returning();
    return user;
};
