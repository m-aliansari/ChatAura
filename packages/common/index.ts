export * from "./error.js";
export * from "./schemas.js";

export const appName = "realtime-chatapp";

export const SOCKET_EVENTS = {
    ADD_FRIEND: "add_friend",
    FRIENDS_LIST: "friends_list",
    DISCONNECT: "disconnecting",
    CONNECT: "connect",
    CONNECTION_STATUS_CHANGED: "connection_status_changed",
    MESSAGES: "messages",
    LOAD_OLDER: "load_older",
    LOAD_MORE_FRIENDS: "load_more_friends",
    CONNECTION_ERROR: "connect_error",
    DIRECT_MESSAGE: "direct_message",
    FRIEND_ADDED: "friend_added",
    NEW_MESSAGE_ID: "new_message_id",
    TYPING: "typing",
    STOP_TYPING: "stop_typing",
    REMOVE_FRIEND: "remove_friend",
    FRIEND_REMOVED: "friend_removed",
    MARK_READ: "mark_read",
} as const satisfies Record<string, string>;

// Derived union of every socket event string — the cheap, additive precursor to fully typed
// Socket.io event contracts (see docs/ROADMAP.md "Typed Socket.io event contracts"). `as const`
// keeps the literal types; `satisfies Record<string, string>` guards against a non-string value.
export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export const API_ROUTES = {
    AUTH: {
        BASE: "/auth",
        LOGIN: "/auth/login",
        REGISTER: "/auth/register",
        SPECIFIC: {
            LOGIN: "/login",
            REGISTER: "/register",
        },
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
            MESSAGE: "/message",
        },
    },
    HOME: "/home",
    HEALTH: "/health",
} as const;
