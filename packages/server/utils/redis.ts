import { createClient } from "redis";

export const redisClient =
    process.env.NODE_ENV === "production"
        ? createClient({
              username: process.env.REDIS_USERNAME,
              password: process.env.REDIS_PASSWORD,
              socket: {
                  host: process.env.REDIS_SOCKET_HOST,
                  port: Number(process.env.REDIS_SOCKET_PORT),
              },
          })
        : createClient();
