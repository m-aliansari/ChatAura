import { hash } from "bcrypt"
import { v4 as uuidv4 } from "uuid"
import { checkUserExists } from "../../utils/users.js"
import { pool } from "../../utils/postgres.js"
import { jwtSignPromise } from "../../utils/jwt.js"
import { ADD_NEW_USER } from "../../queries/auth.js"


export const handleRegister = async (req, res) => {
    const userExists = await checkUserExists(req.body.username)

    if (userExists) return res.json({ loggedIn: false, status: "Username taken" })

    const hashedPass = await hash(req.body.password, 10);
    const newUserQuery = await pool.query(
        ADD_NEW_USER,
        [uuidv4(), req.body.username, hashedPass]
    )

    const { username, user_id, id } = newUserQuery[0]

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
}