import { useState } from "react";
import { FriendsContext } from "./FriendsContext.js";

export const FriendsContextProvider = ({ children }) => {
    const [friendList, setFriendList] = useState([]);
    return (
        <FriendsContext.Provider value={{ friendList, setFriendList }}>
            {children}
        </FriendsContext.Provider>
    );
};
