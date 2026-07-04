import { object, string } from "yup";

export const authFormSchema = object({
    username: string()
        .strict()
        .required("Username required")
        .trim("Username cannot contain leading or trailing whitespace")
        .min(6, "Username too short")
        .max(28, "Username too long")
        .matches(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
    password: string()
        .strict()
        .required("Password required")
        .trim("Password cannot contain leading or trailing whitespace")
        .min(6, "Password too short")
        .max(28, "Password too long"),
});

export const friendFormSchema = authFormSchema.omit(["password"]);

export const messageFormSchema = object({
    message: string()
        .required("Message required")
        .trim()
        .min(1, "Message cannot be empty")
        .max(255, "Max length is 255"),
});
