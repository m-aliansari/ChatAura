import { jwtVerifyPromise } from "../../utils/jwt.js";
import { getUserByUserId } from "../../db/repositories/users.js";
import type { Socket } from "socket.io";
import type { AuthedUser } from "../../types/socket.js";

export const authorizeUser = async (socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth.token;

    const [err, decoded] = await jwtVerifyPromise(token);

    if (
        err ||
        !decoded ||
        Object.keys(decoded).length === 0 ||
        !decoded.username ||
        !decoded.user_id
    ) {
        console.log("error in authorizeUser", err);

        return next(new Error("Not authorized"));
    }

    // The token may be validly signed yet belong to a user that no longer
    // exists (deleted account). Verify against the source of truth before
    // granting the connection. Fail closed if the lookup itself errors.
    try {
        const user = await getUserByUserId(decoded.user_id);
        if (!user) {
            return next(new Error("Not authorized"));
        }
    } catch (lookupErr) {
        console.log("error in authorizeUser db lookup", lookupErr);
        return next(new Error("Not authorized"));
    }

    socket.user = { ...decoded } as AuthedUser;
    next();
};
