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
import { sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { messages } from "../db/schema/messages.js";
import { getUserByUsername } from "../db/repositories/users.js";
import { addFriendship } from "../db/repositories/friendships.js";
import {
    getOrCreateDirectConversation,
    bumpConversationLastMessage,
} from "../db/repositories/conversations.js";
import { registerUser } from "../services/registerUser.js";

if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed: NODE_ENV=production");
    process.exit(1);
}

const RESET = process.argv.includes("--reset");
const FRIENDS = Number(process.env.SEED_FRIENDS ?? 40);
const MESSAGES = Number(process.env.SEED_MESSAGES ?? 60);
const USERNAME = process.env.SEED_USERNAME ?? "demouser";
const PASSWORD = process.env.SEED_PASSWORD ?? "secret1";
const FULLNAME = process.env.SEED_FULLNAME ?? "Demo User";

// Display names for seeded friends. Cycled first/last lists give varied, realistic names for the
// WhatsApp-style list — and, unlike the "friendNN" usernames, they are digit-free so they satisfy
// `registerCredentialsSchema`'s full-name pattern (letters/spaces/.'- only).
const SEED_FIRST_NAMES = [
    "Ava",
    "Ben",
    "Cara",
    "Dan",
    "Ella",
    "Finn",
    "Gina",
    "Hugo",
    "Iris",
    "Jack",
    "Kira",
    "Leo",
    "Mia",
    "Noah",
    "Owen",
    "Priya",
    "Quinn",
    "Rosa",
    "Sam",
    "Tara",
];
const SEED_LAST_NAMES = [
    "Adams",
    "Brown",
    "Clark",
    "Davis",
    "Evans",
    "Ford",
    "Gray",
    "Hill",
    "Ives",
    "Jones",
];
const seedFullName = (i: number) =>
    `${SEED_FIRST_NAMES[i % SEED_FIRST_NAMES.length]} ${SEED_LAST_NAMES[i % SEED_LAST_NAMES.length]}`;

/**
 * Reuse an existing user so the seeder is re-runnable without --reset. New users go through
 * `registerUser`, the same domain operation `/auth/register` uses — so the seeder cannot create
 * an account that fails `authFormSchema` and would be rejected at login with a 422.
 */
const ensureUser = async (username: string, password: string, fullName: string) => {
    const existing = await getUserByUsername(username);
    if (existing) return existing;

    const result = await registerUser({ username, password, fullName });
    if (!result.ok) {
        const why = result.reason === "invalid" ? result.message : "username taken";
        throw new Error(`Refusing to seed un-loginable account "${username}": ${why}`);
    }
    return result.user;
};

const seed = async () => {
    if (RESET) {
        await db.execute(
            sql`TRUNCATE users, fcm_tokens, friendships, messages RESTART IDENTITY CASCADE`,
        );
        console.log("Reset: truncated users, fcm_tokens, friendships, messages");
    }

    const friendNames = Array.from(
        { length: FRIENDS },
        (_, i) => `friend${String(i + 1).padStart(2, "0")}`,
    );

    const me = await ensureUser(USERNAME, PASSWORD, FULLNAME);
    console.log(`Primary user: ${me.username} (user_id ${me.user_id})`);

    for (let i = 1; i <= FRIENDS; i++) {
        const friend = await ensureUser(friendNames[i - 1], PASSWORD, seedFullName(i - 1));
        await addFriendship(me.user_id, friend.user_id);
        const conversationId = await getOrCreateDirectConversation(me.user_id, friend.user_id);

        if (MESSAGES > 0) {
            // Bulk-insert the conversation: ids ascend with insertion order, which is exactly
            // what the `id` pagination cursor relies on. Friends are seeded in order, so later
            // friends get higher message ids and sort to the top of the inbox — a live demo of the
            // latest-message ordering.
            const rows = Array.from({ length: MESSAGES }, (_, n) => {
                const fromFriend = n % 2 === 1;
                return {
                    message_id: uuid(),
                    conversation_id: conversationId,
                    sender_user_id: fromFriend ? friend.user_id : me.user_id,
                    content: `Message ${n + 1} of ${MESSAGES} with ${friend.username}`,
                };
            });
            const inserted = await db.insert(messages).values(rows).returning({ id: messages.id });
            // Seed the denormalised inbox sort pointer for both members.
            const maxId = Math.max(...inserted.map((r) => r.id));
            await bumpConversationLastMessage(conversationId, maxId);
        }

        if (i % 10 === 0) console.log(`  seeded ${i}/${FRIENDS} friends`);
    }

    console.log(
        `\nDone. ${FRIENDS} friends x ${MESSAGES} messages each (${FRIENDS * MESSAGES} messages).`,
    );
    console.log(`Log in as "${USERNAME}" / "${PASSWORD}" (friends share the same password).`);
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
