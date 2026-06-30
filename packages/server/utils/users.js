import { CHECK_USER_EXISTS } from "../queries/auth.js";
import { pool } from "./postgres.js";

export const checkUserExists = async (username) => {
    try {
        const existingUser = await pool.query(CHECK_USER_EXISTS, [username]);
        if (existingUser.length !== 0) {
            return true;
        }
        return false;
    } catch (error) {
        console.log("error in checkUserExists");

        console.log(error);

        return false;
    }
};
