export const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL ?? "";
export const CLIENT_BASE_URL_DEV =
    process.env.NODE_ENV === "production" ? "" : (process.env.CLIENT_BASE_URL_DEV ?? "");
