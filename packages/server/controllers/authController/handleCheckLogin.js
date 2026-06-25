import { getJwtTokenFromRequest, jwtVerifyPromise } from "../../utils/jwt.js"
import { checkUserExists } from "../../utils/users.js"


/**
 * 
 * @param {import("express").Request} req 
 * @param {import("express").Response} res 
 * @returns 
 */

export const handleCheckLogin = async (req, res) => {
    // if (req.session.user && req.session.user.username) {
    //     return res.json({ loggedIn: true, username: req.session.user.username })
    // } else {
    //     return res.json({ loggedIn: false })
    // }
    const token = getJwtTokenFromRequest(req)
    if (!token) return res.json({ loggedIn: false })

    const [err, decoded] = await jwtVerifyPromise(token)

    if (err || !decoded) {
        return res.json({ loggedIn: false })
    }

    const userExists = await checkUserExists(decoded.username)

    if (!userExists) res.json({ loggedIn: false })

    if (err) return res.json({ loggedIn: false })

    return res.json({ loggedIn: true, token })
}