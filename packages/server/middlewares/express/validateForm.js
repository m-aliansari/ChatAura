import { authFormSchema } from "@realtime-chatapp/common";

/**
 * Limits API requests by user IP.
 * @param {import("express").Request} req - Request object.
 * @param {import("express").Response} res - Response object.
 * @param {import("express").NextFunction} next - The next function.
 * @returns {import("express").Response | void}
 */
const validateForm = async (req, res, next) => {
    const formData = req.body;
    try {
        const valid = await authFormSchema.validate(formData);
        if (!valid) {
            res.status(422).send();
        }
        return next();
    } catch (err) {
        console.log("error in validateForm");
        console.log(err.errors);
        res.status(422).send();
    }
};

export default validateForm;
