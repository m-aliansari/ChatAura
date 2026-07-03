import { redisClient } from "../redis.js";
import { getHashMapKey } from "./common.js";

// Online status is a persisted flag in Redis (`connected` on each user's hash),
// reset to "false" only by the disconnect grace-timer. That timer never runs when
// the server process itself dies while clients are connected (nodemon restart in
// dev, a deploy in prod, a crash) — the dropped sockets emit no `disconnect` the
// next process can see, and the in-memory timers are gone. Stale `connected:"true"`
// entries then make offline users appear online to their friends.
//
// On startup there are zero live sockets, so every presence flag is stale by
// definition. Reset them all to offline; reconnecting clients re-announce
// themselves as online via initializeUser. Run this before the server starts
// listening so no reconnecting socket can race the reset.
export const reconcilePresence = async () => {
    // Startup-only scan; KEYS is acceptable here (one-time, at boot).
    const keys = await redisClient.keys(getHashMapKey("*"));

    for (const key of keys) {
        await redisClient.hSet(key, { connected: "false" });
    }

    return keys.length;
};
