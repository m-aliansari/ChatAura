import { compare } from "bcrypt"
import { pool } from "../../utils/postgres.js"
import { jwtSignPromise } from "../../utils/jwt.js"
import { GET_USER_BY_USERNAME } from "../../queries/auth.js"

export const handleLogin = async (req, res) => {
    try {
        const potentialLogin = await pool.query(
            GET_USER_BY_USERNAME,
            [req.body.username]
        )
        if (potentialLogin.length === 0)
            return res.json({ loggedIn: false, status: "Wrong username or password!" })

        const isPassCorrect = await compare(req.body.password, potentialLogin[0].passhash)


        if (!isPassCorrect)
            return res.json({ loggedIn: false, status: "Wrong username or password!" })

        const { username, user_id, id } = potentialLogin[0]
        const [err, token] = await jwtSignPromise({
            username,
            user_id,
            id
        }, {
            expiresIn: "3h"
        })

        if (err)
            return res.json({ loggedIn: false, status: "Something went wrong, try again later" })
        return res.json({ loggedIn: true, token })
    } catch (error) {
        console.log("error in handle login");

        console.log(error);
        return res.json({ loggedIn: false, status: "Something went wrong, try again later" })
    }
}