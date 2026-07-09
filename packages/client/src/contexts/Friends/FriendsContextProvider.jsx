import { useState } from "react";
import { FriendsContext } from "./FriendsContext.js";

export const FriendsContextProvider = ({ children }) => {
    const [friendList, setFriendList] = useState([]);
    // Pagination state for the infinite-scroll friends list: `cursor` is the opaque
    // { createdAt, userId } tuple to continue from, echoed back to LOAD_MORE_FRIENDS.
    const [friendsMeta, setFriendsMeta] = useState({
        cursor: null,
        hasMore: false,
        loading: false,
    });
    return (
        <FriendsContext.Provider value={{ friendList, setFriendList, friendsMeta, setFriendsMeta }}>
            {children}
        </FriendsContext.Provider>
    );
};
