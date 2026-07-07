import { and, eq } from "drizzle-orm";
import { db } from "../index.js";
import { fcmTokens } from "../schema/fcmTokens.js";

/** Idempotent insert — a repeat (user, token) pair is a UNIQUE conflict and is ignored. */
export const addToken = async (userId: string, token: string) => {
    await db.insert(fcmTokens).values({ user_id: userId, token }).onConflictDoNothing();
};

export const removeToken = async (userId: string, token: string) => {
    await db
        .delete(fcmTokens)
        .where(and(eq(fcmTokens.user_id, userId), eq(fcmTokens.token, token)));
};

export const getTokens = async (userId: string): Promise<string[]> => {
    const rows = await db
        .select({ token: fcmTokens.token })
        .from(fcmTokens)
        .where(eq(fcmTokens.user_id, userId));
    return rows.map((r) => r.token);
};
