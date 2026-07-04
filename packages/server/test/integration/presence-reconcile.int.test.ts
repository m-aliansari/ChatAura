import { describe, it, expect } from "vitest";
import { redisClient } from "../../utils/redis.js";
import { getHashMapKey } from "../../utils/socket/common.js";
import { reconcilePresence } from "../../utils/socket/reconcilePresence.js";

// Reproduces the "offline user shows online" bug: a previous server run marked a
// user connected, then the process died before the disconnect grace-timer could
// reset the flag. On the next startup there is no live socket, yet Redis still
// says connected:"true". reconcilePresence() must clear it.
describe("reconcilePresence (startup)", () => {
    it("flips a stale connected:true flag to false when no socket is live", async () => {
        await redisClient.hSet(getHashMapKey("john123"), {
            user_id: "c2044a2b-1b8d-477b-bceb-caa14e6b2316",
            connected: "true",
        });

        await reconcilePresence();

        expect(await redisClient.hGet(getHashMapKey("john123"), "connected")).toBe("false");
    });

    it("resets every user's presence and preserves the rest of the hash", async () => {
        await redisClient.hSet(getHashMapKey("alice"), { user_id: "id-a", connected: "true" });
        await redisClient.hSet(getHashMapKey("bob"), { user_id: "id-b", connected: "false" });

        const count = await reconcilePresence();

        expect(count).toBe(2);
        expect(await redisClient.hGetAll(getHashMapKey("alice"))).toEqual({
            user_id: "id-a",
            connected: "false",
        });
        expect(await redisClient.hGetAll(getHashMapKey("bob"))).toEqual({
            user_id: "id-b",
            connected: "false",
        });
    });

    it("is a no-op when there are no users", async () => {
        expect(await reconcilePresence()).toBe(0);
    });
});
