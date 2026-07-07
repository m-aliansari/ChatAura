import { hash } from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { addUser, checkUserExists } from "../../db/repositories/users.js";
import { jwtSignPromise } from "../../utils/jwt.js";
import { GENERIC_ERROR } from "@realtime-chatapp/common";
import type { Request, Response } from "express";

export const handleRegister = async (req: Request, res: Response) => {
    try {
        const userExists = await checkUserExists(req.body.username);

        if (userExists) return res.json({ loggedIn: false, status: "Username taken" });

        const hashedPass = await hash(req.body.password, 10);

        const { username, user_id, id } = await addUser({
            user_id: uuidv4(),
            username: req.body.username,
            passhash: hashedPass,
        });

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
