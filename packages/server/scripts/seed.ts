// Dev seeder: builds a chat account with enough friends and history to exercise the
// infinite-scroll / pagination paths by hand.
//
//   yarn workspace @realtime-chatapp/server db:seed            # 40 friends x 60 messages
//   yarn workspace @realtime-chatapp/server db:seed --reset    # wipe all tables first
//
// Defaults deliberately exceed both page sizes (FRIENDS_PAGE_SIZE=15,
// MESSAGES_PAGE_SIZE=30) so LOAD_MORE_FRIENDS and LOAD_OLDER both trigger.
// Tunable via SEED_FRIENDS / SEED_MESSAGES / SEED_USERNAME / SEED_PASSWORD.
//
// `dotenv/config.js` MUST be the first import: db/index.ts reads the DATABASE_* vars at
// import time, and ES module imports are evaluated in order.
import "dotenv/config.js";
import { hash } from "bcrypt";
import { sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { messages } from "../db/schema/messages.js";
import { addUser, getUserByUsername } from "../db/repositories/users.js";
import { addFriendship } from "../db/repositories/friendships.js";

if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed: NODE_ENV=production");
    process.exit(1);
}

const RESET = process.argv.includes("--reset");
const FRIENDS = Number(process.env.SEED_FRIENDS ?? 40);
const MESSAGES = Number(process.env.SEED_MESSAGES ?? 60);
const USERNAME = process.env.SEED_USERNAME ?? "demo";
const PASSWORD = process.env.SEED_PASSWORD ?? "secret1";

/** Reuse an existing user so the seeder is re-runnable without --reset. */
const ensureUser = async (username: string, passhash: string) => {
    const existing = await getUserByUsername(username);
    if (existing) return existing;
    return addUser({ user_id: uuid(), username, passhash });
};

const seed = async () => {
    if (RESET) {
        await db.execute(
            sql`TRUNCATE users, fcm_tokens, friendships, messages RESTART IDENTITY CASCADE`,
        );
        console.log("Reset: truncated users, fcm_tokens, friendships, messages");
    }

    // One hash for every seeded account — bcrypt is deliberately slow, and they share a password.
    const passhash = await hash(PASSWORD, 10);

    const me = await ensureUser(USERNAME, passhash);
    console.log(`Primary user: ${me.username} (user_id ${me.user_id})`);

    for (let i = 1; i <= FRIENDS; i++) {
        const friend = await ensureUser(`friend${String(i).padStart(2, "0")}`, passhash);
        await addFriendship(me.user_id, friend.user_id);

        if (MESSAGES > 0) {
            // Bulk-insert the conversation: ids ascend with insertion order, which is exactly
            // what the `id` pagination cursor relies on.
            const rows = Array.from({ length: MESSAGES }, (_, n) => {
                const fromFriend = n % 2 === 1;
                return {
                    message_id: uuid(),
                    from_user_id: fromFriend ? friend.user_id : me.user_id,
                    to_user_id: fromFriend ? me.user_id : friend.user_id,
                    content: `Message ${n + 1} of ${MESSAGES} with ${friend.username}`,
                };
            });
            await db.insert(messages).values(rows);
        }

        if (i % 10 === 0) console.log(`  seeded ${i}/${FRIENDS} friends`);
    }

    console.log(
        `\nDone. ${FRIENDS} friends x ${MESSAGES} messages each (${FRIENDS * MESSAGES} messages).`,
    );
    console.log(`Log in as "${USERNAME}" / "${PASSWORD}".`);
    console.log(
        `Friends list pages at 15 -> scroll the sidebar; conversations page at 30 -> scroll a chat up.`,
    );
};

seed()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Seed failed:", error);
        process.exit(1);
    });
