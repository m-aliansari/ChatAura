import { appName } from "@realtime-chatapp/common";
import { redisClient } from "../../utils/redis.js";
import type { Request, Response, NextFunction } from "express";

/**
 * Limits API requests by user IP.
 */
export const rateLimiter =
    (secondsLimit: number, limitAmount: number) =>
    async (req: Request, res: Response, next: NextFunction) => {
        // Test/CI seam: skip throttling (e.g. E2E, where many requests share one IP).
        if (process.env.DISABLE_RATE_LIMIT === "true") return next();

        const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
        // Per-route budget: one route's traffic must not exhaust another's.
        const key = `${appName}:rate-limit:${ip}:${req.baseUrl}${req.path}`;

        try {
            const [response] = await redisClient.multi().incr(key).expire(key, secondsLimit).exec();

            if (Number(response) > limitAmount)
                return res.status(429).json({ loggedIn: false, status: "Too many requests" });
            return next();
        } catch (error) {
            console.log("error in rate limiter");
            console.log(error);
            return res.status(500).json({ loggedIn: false, status: "Internal server error" });
        }
    };
