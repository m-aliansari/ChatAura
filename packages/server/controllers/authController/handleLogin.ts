import { compare } from "bcrypt";
import { getUserByUsername } from "../../db/repositories/users.js";
import { jwtSignPromise } from "../../utils/jwt.js";
import { GENERIC_ERROR } from "@realtime-chatapp/common";
import type { Request, Response } from "express";

export const handleLogin = async (req: Request, res: Response) => {
    try {
        const potentialLogin = await getUserByUsername(req.body.username);
        if (!potentialLogin)
            return res.json({ loggedIn: false, status: "Wrong username or password!" });

        const isPassCorrect = await compare(req.body.password, potentialLogin.passhash);

        if (!isPassCorrect)
            return res.json({ loggedIn: false, status: "Wrong username or password!" });

        const { username, user_id, id } = potentialLogin;
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

        if (err) return res.json({ loggedIn: false, status: GENERIC_ERROR });
        return res.json({ loggedIn: true, token });
    } catch (error) {
        console.log("error in handle login");

        console.log(error);
        return res.json({ loggedIn: false, status: GENERIC_ERROR });
    }
};
