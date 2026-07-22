import {
    Box,
    Dialog,
    HStack,
    IconButton,
    Menu,
    Portal,
    Separator,
    Spacer,
    Tabs,
    Text,
    VStack,
} from "@chakra-ui/react";
import "../../../styles/scrollbar.css";

import { MdAccountCircle, MdAdd, MdDarkMode, MdLightMode, MdLogout } from "react-icons/md";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { FriendsContext } from "../../../contexts/Friends/FriendsContext";
import { SocketContext } from "../../../contexts/Socket/SocketContext.js";
import { MessagesContext } from "../../../contexts/Messages/MessagesContext.js";
import { useContext, useRef } from "react";
import { AddFriendModal } from "./AddFriendModal";
import { FriendRow } from "./FriendRow.jsx";
import { FlatLogo } from "../../common/Logo/FlatLogo.jsx";
import { ScrollLoader } from "../../common/ScrollLoader.jsx";
import { useLogout } from "../../../hooks/useLogout.jsx";
import { useColorMode } from "../../ui/color-mode.jsx";
import { mergeMessages } from "../../../utils/mergeMessages.js";

export const SideBar = () => {
    const { friendList, setFriendList, friendsMeta, setFriendsMeta } = useContext(FriendsContext);
    const { socket } = useContext(SocketContext);
    const { setMessages } = useContext(MessagesContext);
    const { colorMode, toggleColorMode } = useColorMode();
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
            {/* Bind the pane to the viewport directly (like ChatMessages' `h="100dvh"`), NOT `h=100%`
                of the parent: the desktop Grid in Home.jsx sets no grid-template-rows, so its row is
                auto-sized and the GridItem grows to content — a `100%` here would inherit that
                unbounded height, the list's `flex="1"` would never be capped, and the whole PAGE
                would scroll instead of the list (which also kills LOAD_MORE_FRIENDS, since onScroll
                is bound to the list, not the body). `overflow="hidden"` keeps the scroll inside the
                list. */}
            <VStack h="100dvh" overflow="hidden" gap="0" align="stretch">
                {/* Single-row app bar: identity left, actions right. Logout lives in the account
                    menu rather than sitting in the bar — it is a rare action and should not be the
                    loudest element in the sidebar. */}
                <HStack px="3" py="2.5" gap="2">
                    <FlatLogo width="120px" />
                    <Spacer />
                    <Dialog.Trigger asChild>
                        <IconButton variant="ghost" size="sm" aria-label="Add Friend">
                            <MdAdd />
                        </IconButton>
                    </Dialog.Trigger>
                    <Menu.Root lazyMount unmountOnExit>
                        <Menu.Trigger asChild>
                            <IconButton variant="ghost" size="sm" aria-label="Account">
                                <MdAccountCircle />
                            </IconButton>
                        </Menu.Trigger>
                        <Portal>
                            <Menu.Positioner>
                                <Menu.Content>
                                    <Menu.Item value="theme" onSelect={toggleColorMode}>
                                        {colorMode === "dark" ? <MdLightMode /> : <MdDarkMode />}
                                        <Box flex="1">
                                            {colorMode === "dark" ? "Light mode" : "Dark mode"}
                                        </Box>
                                    </Menu.Item>
                                    <Menu.Separator />
                                    <Menu.Item
                                        value="logout"
                                        color="fg.error"
                                        _hover={{ bg: "bg.error", color: "fg.error" }}
                                        onSelect={logout}
                                    >
                                        <MdLogout />
                                        <Box flex="1">Logout</Box>
                                    </Menu.Item>
                                </Menu.Content>
                            </Menu.Positioner>
                        </Portal>
                    </Menu.Root>
                </HStack>
                <Separator />

                {friendList?.length ? (
                    <>
                        {/* Flat and edge-to-edge: no container of its own. The pane already has a
                            border; a second card inside it read as two competing surfaces. */}
                        <VStack
                            as={Tabs.List}
                            w="100%"
                            gap="0"
                            align="stretch"
                            p="0"
                            flex="1"
                            minH="0"
                            // The `enclosed` Tabs.List recipe paints bg.muted — the same "second
                            // surface inside the pane" the gradient card was creating. It also
                            // collides with the selected row's own bg.muted fill, which would make
                            // selection invisible. Rows sit directly on the pane background.
                            bg="transparent"
                            overflowY="auto"
                            onScroll={handleScroll}
                            data-testid="friends-scroll"
                        >
                            {friendList.map((friend) => (
                                <FriendRow key={friend.user_id} friend={friend} />
                            ))}
                        </VStack>
                        {/* Sits outside Tabs.List: a `role="status"` node inside a `tablist`
                            would not be a valid tab, and screen readers announce it better here. */}
                        {friendsMeta.loading && <ScrollLoader label="Loading more friends…" />}
                    </>
                ) : (
                    <VStack flex="1" justify="center" px="6" gap="1" textAlign="center">
                        <Text fontWeight="medium">No conversations yet</Text>
                        <Text fontSize="sm" color="fg.muted">
                            Add a friend to start chatting.
                        </Text>
                    </VStack>
                )}
            </VStack>
            <AddFriendModal />
        </Dialog.Root>
    );
};
