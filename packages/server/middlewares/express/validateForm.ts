import { authFormSchema } from "@realtime-chatapp/common";
import type { Request, Response, NextFunction } from "express";
import type { ValidationError } from "yup";

const validateForm = async (req: Request, res: Response, next: NextFunction) => {
    const formData = req.body;
    try {
        const valid = await authFormSchema.validate(formData);
        if (!valid) {
            res.status(422).send();
        }
        return next();
    } catch (err) {
        console.log("error in validateForm");
        console.log((err as ValidationError).errors);
        res.status(422).send();
    }
};

export default validateForm;
