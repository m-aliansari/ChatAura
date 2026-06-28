import { object, string } from "yup"

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
})

export const appName = 'realtime-chatapp'

export const friendFormSchema = authFormSchema.omit(['password'])

export const messageFormSchema = object({
    message: string().required("Message required").trim().min(1, "Message cannot be empty").max(255, "Max length is 255")
})

export const SOCKET_EVENTS = {
    ADD_FRIEND: "add_friend",
    FRIENDS_LIST: "friends_list",
    DISCONNECT: "disconnecting",
    CONNECT: "connect",
    CONNECTION_STATUS_CHANGED: "connection_status_changed",
    MESSAGES: "messages",
    CONNECTION_ERROR: "connect_error",
    DIRECT_MESSAGE: "direct_message",
    FRIEND_ADDED: "friend_added",
    NEW_MESSAGE_ID: "new_message_id",
    TYPING: "typing",
    STOP_TYPING: "stop_typing",
    REMOVE_FRIEND: "remove_friend",
    FRIEND_REMOVED: "friend_removed"
}

export const API_ROUTES = {
    AUTH: {
        BASE: "/auth",
        LOGIN: "/auth/login",
        REGISTER: "/auth/register",
        SPECIFIC: {
            LOGIN: "/login",
            REGISTER: "/register",
        }
    },
    FCM: {
        BASE: "/fcm",
        TOKEN: {
            SAVE: "/fcm/token/save",
            DELETE: "/fcm/token/delete",
        },
        MESSAGE: "/fcm/message",
        SPECIFIC: {
            TOKEN: {
                SAVE: "/token/save",
                DELETE: "/token/delete",
            },
            MESSAGE: "/message"
        },
    },
    HOME: "/home"
}