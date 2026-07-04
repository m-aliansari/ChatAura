/**
 * Shape the `authorizeUser` middleware attaches to `socket.user` after
 * verifying the JWT. Cross-context references use the stable `user_id`
 * (per the roadmap's database-per-context boundary principle).
 */
export interface AuthedUser {
    id: number;
    user_id: string;
    username: string;
}

// Every connection handler runs only for sockets the auth middleware has
// already authorized, so `user` is guaranteed present by the time any handler
// (or the connection callback) fires. Augment socket.io's Socket globally so
// the existing `socket.user` access sites type-check without a per-call cast.
declare module "socket.io" {
    interface Socket {
        user: AuthedUser;
    }
}
