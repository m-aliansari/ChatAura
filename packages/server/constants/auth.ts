const secret = process.env.JWT_SECRET;

// Fail fast at boot rather than signing/verifying with an undefined secret.
if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
}

export const JWT_SECRET = secret;
