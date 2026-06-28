import { jwtVerifyPromise } from "../../utils/jwt.js";

export const authorizeUser = async (socket, next) => {
    const token = socket.handshake.auth.token

    const [err, decoded] = await jwtVerifyPromise(token)

    if (err || !decoded || Object.keys(decoded).length === 0 || !decoded.username || !decoded.user_id) {
        console.log("error in authorizeUser", err);

        return next(new Error("Not authorized"))
    }

    socket.user = { ...decoded }
    next()
}