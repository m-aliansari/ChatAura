import { authFormSchema } from "@realtime-chatapp/common";
import type { Request, Response, NextFunction } from "express";
import type { Schema, ValidationError } from "yup";

// Factory: returns middleware that validates `req.body` against `schema`, replying 422 on failure.
// Defaults to `authFormSchema` (login). The register route passes `registerFormSchema` so the full
// name and the confirm-password match are enforced at the HTTP boundary too — defence in depth
// alongside `registerUser`'s own (persisted-fields) validation.
const validateForm =
    (schema: Schema = authFormSchema) =>
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await schema.validate(req.body);
            return next();
        } catch (err) {
            console.log("error in validateForm");
            console.log((err as ValidationError).errors);
            res.status(422).send();
        }
    };

export default validateForm;
