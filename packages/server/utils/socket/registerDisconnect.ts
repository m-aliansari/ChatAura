import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { disconnectTimers, DISCONNECT_GRACE_MS } from "../../constants/socket.js";
import { handleDisconnect } from "./handleDisconnect.js";
import type { Server, Socket } from "socket.io";

// Registers the disconnect grace-period handling for a socket.
//
// On `disconnecting` we don't mark the user offline immediately — a reload is a
// disconnect followed by a near-instant reconnect, and we don't want the user's
// friends to see them flicker offline. Instead we wait DISCONNECT_GRACE_MS and
// then mark them offline ONLY IF they no longer have any live connection.
//
// Checking `io.in(user_id).fetchSockets()` at fire time (rather than trusting a
// clear-on-connect guard) is what keeps a user online for their friends when
// another tab/device is still connected, or when a reconnect races ahead of the
// old socket's `disconnecting` event.
export const registerDisconnect = (io: Server, socket: Socket) => {
    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        const { username, user_id } = socket.user;

        const existing = disconnectTimers.get(username);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(async () => {
            disconnectTimers.delete(username);
            const sockets = await io.in(user_id).fetchSockets();
            if (sockets.length === 0) await handleDisconnect(socket);
        }, DISCONNECT_GRACE_MS);

        disconnectTimers.set(username, timer);
    });
};
