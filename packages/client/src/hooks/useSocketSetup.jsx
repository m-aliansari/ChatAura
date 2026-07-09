import { useContext, useEffect, useRef } from "react";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { FriendsContext } from "../contexts/Friends/FriendsContext.js";
import { UserContext } from "../contexts/User/UserContext.js";
import { SocketContext } from "../contexts/Socket/SocketContext.js";
import { MessagesContext } from "../contexts/Messages/MessagesContext.js";

export const useSocketSetup = (tabs) => {
    const { setUser } = useContext(UserContext);
    const { setFriendList, setFriendsMeta } = useContext(FriendsContext);
    const { setMessages } = useContext(MessagesContext);
    const { socket } = useContext(SocketContext);

    // Keep the latest tabs api without resubscribing listeners on every render.
    const tabsRef = useRef(tabs);
    tabsRef.current = tabs;

    useEffect(() => {
        socket.connect();

        socket.on(SOCKET_EVENTS.FRIENDS_LIST, ({ friends, hasMore, cursor }) => {
            setFriendList(friends);
            setFriendsMeta({ cursor, hasMore, loading: false });
        });

        socket.on(SOCKET_EVENTS.FRIEND_ADDED, (newFriend) => {
            setFriendList((prevList) => {
                const friendExists = prevList.find(
                    (friend) => friend.user_id === newFriend.user_id,
                );

                if (friendExists) return prevList;
                return [...prevList, newFriend];
            });
        });

        socket.on(SOCKET_EVENTS.FRIEND_REMOVED, ({ user_id }) => {
            setFriendList((prevList) => prevList.filter((friend) => friend.user_id !== user_id));
            setMessages((prevMsgs) =>
                prevMsgs.filter((m) => m.to !== user_id && m.from !== user_id),
            );
            const tabsApi = tabsRef.current;
            if (tabsApi?.value === user_id) tabsApi.setValue(null);
        });

        socket.on(SOCKET_EVENTS.CONNECTION_STATUS_CHANGED, (status, username) => {
            setFriendList((prevFriends) => {
                return prevFriends.map((friend) => {
                    if (friend.username === username) {
                        friend.connected = status;
                    }
                    return friend;
                });
            });
        });

        socket.on(SOCKET_EVENTS.CONNECTION_ERROR, (e) => {
            console.log("connection error in useSocketSetup hook");
            console.log(e);

            setUser({ loggedIn: false });
        });

        return () => {
            socket.off(SOCKET_EVENTS.FRIENDS_LIST);
            socket.off(SOCKET_EVENTS.FRIEND_ADDED);
            socket.off(SOCKET_EVENTS.FRIEND_REMOVED);
            socket.off(SOCKET_EVENTS.CONNECTION_STATUS_CHANGED);
            socket.off(SOCKET_EVENTS.CONNECTION_ERROR);
        };
    }, [setUser, setFriendList, setFriendsMeta, setMessages, socket]);
};
