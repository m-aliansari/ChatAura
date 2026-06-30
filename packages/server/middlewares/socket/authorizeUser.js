import { jwtVerifyPromise } from "../../utils/jwt.js";
import { pool } from "../../utils/postgres.js";
import { GET_USER_BY_USER_ID } from "../../queries/auth.js";

export const authorizeUser = async (socket, next) => {
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
        const rows = await pool.query(GET_USER_BY_USER_ID, [decoded.user_id]);
        if (rows.length === 0) {
            return next(new Error("Not authorized"));
        }
    } catch (lookupErr) {
        console.log("error in authorizeUser db lookup", lookupErr);
        return next(new Error("Not authorized"));
    }

    socket.user = { ...decoded };
    next();
};
