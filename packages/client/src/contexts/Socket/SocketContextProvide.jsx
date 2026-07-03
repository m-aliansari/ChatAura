import { useContext, useEffect, useState } from "react";
import { getSocketCon } from "../../utils/socket.js";
import { SocketContext } from "./SocketContext.js";
import { UserContext } from "../User/UserContext.js";

export const SocketContextProvide = ({ children }) => {
    const { user } = useContext(UserContext);
    // One socket for the lifetime of this mounted (authenticated) session.
    // Recreating it on every `user` change — as this did before — left the
    // previous socket connected, so a user accumulated orphan connections and
    // appeared perpetually online to friends (a single logout/close could not
    // take them offline). Disconnect on unmount so logout/navigation fully
    // tears the connection down.
    const [socket] = useState(() => getSocketCon(user));

    useEffect(() => {
        return () => {
            socket.disconnect();
        };
    }, [socket]);

    return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};
