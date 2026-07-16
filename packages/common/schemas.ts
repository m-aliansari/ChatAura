import { object, ref, string } from "yup";

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

// The fields a registration actually PERSISTS: the auth pair + a display name. `.shape()`
// returns a *new* schema, so `authFormSchema` (and therefore `friendFormSchema` and the login
// route) keep exactly their two fields — the register-only fields do not leak into them.
// `registerUser` validates against THIS schema (not the form schema below) so the seeder / CLI,
// which have no `confirmPassword`, stay valid.
export const registerCredentialsSchema = authFormSchema.shape({
    fullName: string()
        .strict()
        .required("Full name required")
        .trim("Full name cannot contain leading or trailing whitespace")
        .min(2, "Full name too short")
        .max(60, "Full name too long")
        .matches(/^[\p{L} .'-]+$/u, "Full name can only contain letters, spaces, and . ' -"),
});

// The full registration FORM: persisted fields + a form-only `confirmPassword` that must match
// `password`. `confirmPassword` is never stored — `registerUser` strips it by validating against
// `registerCredentialsSchema` above. Used by the Signup form and the register route middleware.
export const registerFormSchema = registerCredentialsSchema.shape({
    confirmPassword: string()
        .required("Confirm your password")
        .oneOf([ref("password")], "Passwords must match"),
});

export const messageFormSchema = object({
    message: string()
        .required("Message required")
        .trim()
        .min(1, "Message cannot be empty")
        .max(255, "Max length is 255"),
});
