import { registerUser } from "../../services/registerUser.js";
import { jwtSignPromise } from "../../utils/jwt.js";
import { GENERIC_ERROR } from "@realtime-chatapp/common";
import type { Request, Response } from "express";

// Thin transport adapter: the domain rules (validation, uniqueness, hashing) belong to
// `registerUser`; this only maps its result onto HTTP and mints the JWT.
export const handleRegister = async (req: Request, res: Response) => {
    try {
        const result = await registerUser({
            username: req.body?.username,
            password: req.body?.password,
        });

        if (!result.ok) {
            if (result.reason === "username_taken")
                return res.json({ loggedIn: false, status: "Username taken" });

            // Normally unreachable — `validateForm` rejects the request first. This is the
            // domain layer's own guard, kept as defence in depth against a new route/middleware
            // wiring mistake.
            return res.status(422).json({ loggedIn: false, status: result.message });
        }

        const { username, user_id, id } = result.user;

        const [err, token] = await jwtSignPromise(
            {
                username,
                user_id,
                id,
            },
            {
                expiresIn: "3h",
            },
        );

        if (err) {
            console.error(err);

            return res.json({ loggedIn: false, status: GENERIC_ERROR });
        }

        return res.json({ loggedIn: true, token });
    } catch (err) {
        console.error(err);

        return res.json({ loggedIn: false, status: GENERIC_ERROR });
    }
};
