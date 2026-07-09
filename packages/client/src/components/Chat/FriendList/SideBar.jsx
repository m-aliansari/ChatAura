import { Button, Heading, HStack, VStack, Separator, Tabs, Dialog } from "@chakra-ui/react";
import "../../../styles/scrollbar.css";

import { MdAdd } from "react-icons/md";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { FriendsContext } from "../../../contexts/Friends/FriendsContext";
import { SocketContext } from "../../../contexts/Socket/SocketContext.js";
import { MessagesContext } from "../../../contexts/Messages/MessagesContext.js";
import { useContext, useRef } from "react";
import { AddFriendModal } from "./AddFriendModal";
import { FriendRow } from "./FriendRow.jsx";
import { FlatLogo } from "../../common/Logo/FlatLogo.jsx";
import { useLogout } from "../../../hooks/useLogout.jsx";
import { mergeMessages } from "../../../utils/mergeMessages.js";

export const SideBar = () => {
    const { friendList, setFriendList, friendsMeta, setFriendsMeta } = useContext(FriendsContext);
    const { socket } = useContext(SocketContext);
    const { setMessages } = useContext(MessagesContext);
    const logout = useLogout();

    // Ref mirror of friendsMeta so the scroll handler reads the latest without stale closures.
    const friendsMetaRef = useRef(friendsMeta);
    friendsMetaRef.current = friendsMeta;

    const loadMoreFriends = () => {
        const meta = friendsMetaRef.current;
        if (!meta.hasMore || meta.loading) return;

        friendsMetaRef.current = { ...meta, loading: true };
        setFriendsMeta(friendsMetaRef.current);

        socket.emit(
            SOCKET_EVENTS.LOAD_MORE_FRIENDS,
            { cursor: meta.cursor },
            ({ friends, hasMore, cursor, messages }) => {
                setFriendList((prev) => {
                    const seen = new Set(prev.map((f) => f.user_id));
                    return [...prev, ...friends.filter((f) => !seen.has(f.user_id))];
                });
                setMessages((prev) => mergeMessages(prev, messages));
                friendsMetaRef.current = { cursor, hasMore, loading: false };
                setFriendsMeta(friendsMetaRef.current);
            },
        );
    };

    const handleScroll = (e) => {
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) loadMoreFriends();
    };

    return (
        <Dialog.Root placement="center" motionPreset="slide-in-bottom">
            <VStack py="1.4rem">
                <FlatLogo width="150px" />
                <HStack justify="center" gap="15px" w="100%" flexWrap="wrap" px="0.5rem">
                    <Heading size={{ base: "sm", md: "md" }}>Add Friend</Heading>
                    <Dialog.Trigger asChild>
                        <Button variant="surface" aria-label="Add Friend">
                            <MdAdd size={10} />
                        </Button>
                    </Dialog.Trigger>
                    <Button variant="outline" colorPalette="red" size="sm" onClick={logout}>
                        Logout
                    </Button>
                </HStack>
                <Separator />
                {friendList?.length ? (
                    <VStack
                        as={Tabs.List}
                        w="100%"
                        p={{ base: "1rem", md: "2rem" }}
                        maxH="82vh"
                        overflowY="auto"
                        onScroll={handleScroll}
                        backgroundImage={{
                            base: "linear-gradient(to right, #f5f5f5, #e0e0e0)", // light gray gradient for light mode
                            _dark: "linear-gradient(to right, #131313ff, #4a4a4a)", // dark gray gradient for dark mode
                        }}
                        borderRadius="12px" /* Rounded corners for a card-like design */
                        boxShadow="lg" /* Soft shadow for a modern look */
                    >
                        {friendList.map((friend) => (
                            <FriendRow key={friend.user_id} friend={friend} />
                        ))}
                    </VStack>
                ) : (
                    <></>
                )}
            </VStack>
            <AddFriendModal />
        </Dialog.Root>
    );
};
