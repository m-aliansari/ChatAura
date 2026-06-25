import { jwtVerifyPromise } from "../../utils/jwt.js";

export const authorizeUser = async (socket, next) => {
    const token = socket.handshake.auth.token

    const [err, decoded] = await jwtVerifyPromise(token)

    if (err || !decoded) {
        console.log("error in authorizeUser", err);

        next(new Error("Not authorized"))
    }

    socket.user = { ...decoded }
    next()
}