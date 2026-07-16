import {
    Button,
    Circle,
    CloseButton,
    Dialog,
    HStack,
    IconButton,
    Portal,
    Tabs,
    Text,
    VStack,
    useTabsContext,
} from "@chakra-ui/react";
import { MdDelete } from "react-icons/md";
import { useContext, useState } from "react";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { SocketContext } from "../../../contexts/Socket/SocketContext.js";
import { FriendsContext } from "../../../contexts/Friends/FriendsContext.js";
import { MessagesContext } from "../../../contexts/Messages/MessagesContext.js";
import { formatConversationTime } from "../../../utils/formatConversationTime.js";

export const FriendRow = ({ friend }) => {
    const { socket } = useContext(SocketContext);
    const { setFriendList } = useContext(FriendsContext);
    const { setMessages } = useContext(MessagesContext);
    const tabs = useTabsContext();
    const [open, setOpen] = useState(false);

    // Display name replaces the username in the list (older accounts fall back to their username).
    const displayName = friend.full_name || friend.username;
    const preview = friend.lastMessage?.content ?? "";
    const time = formatConversationTime(friend.lastMessage?.createdAt);

    const handleRemove = () => {
        socket.emit(
            SOCKET_EVENTS.REMOVE_FRIEND,
            { username: friend.username, user_id: friend.user_id },
            ({ done }) => {
                if (done) {
                    setFriendList((list) => list.filter((f) => f.user_id !== friend.user_id));
                    setMessages((msgs) =>
                        msgs.filter((m) => m.to !== friend.user_id && m.from !== friend.user_id),
                    );
                    if (tabs.value === friend.user_id) tabs.setValue(null);
                }
                setOpen(false);
            },
        );
    };

    return (
        <HStack w="100%" justify="space-between" gap="2">
            <HStack as={Tabs.Trigger} value={friend.user_id} flex="1" minW="0" gap="3" py="2">
                {/* Subtle presence dot (green online / muted offline) — no avatar/display picture.
                    `data-status` is the stable hook the realtime-presence E2E test asserts on. */}
                <Circle
                    data-status={friend.connected ? "online" : "offline"}
                    aria-label={`${displayName} is ${friend.connected ? "online" : "offline"}`}
                    bg={friend.connected ? "green.400" : { base: "gray.400", _dark: "gray.600" }}
                    w="10px"
                    h="10px"
                    flexShrink="0"
                />
                <VStack flex="1" minW="0" gap="0" align="start">
                    <Text truncate w="100%" fontWeight="semibold" textAlign="left">
                        {displayName}
                    </Text>
                    {preview && (
                        <Text
                            truncate
                            w="100%"
                            fontSize="sm"
                            textAlign="left"
                            color={{ base: "gray.600", _dark: "gray.400" }}
                        >
                            {preview}
                        </Text>
                    )}
                </VStack>
                {time && (
                    <Text
                        fontSize="xs"
                        flexShrink="0"
                        alignSelf="start"
                        pt="1"
                        color={{ base: "gray.500", _dark: "gray.500" }}
                    >
                        {time}
                    </Text>
                )}
            </HStack>
            <Dialog.Root open={open} onOpenChange={(e) => setOpen(e.open)} placement="center">
                <Dialog.Trigger asChild>
                    <IconButton
                        aria-label={`Remove ${displayName}`}
                        variant="ghost"
                        size="sm"
                        colorPalette="red"
                    >
                        <MdDelete />
                    </IconButton>
                </Dialog.Trigger>
                <Portal>
                    <Dialog.Backdrop />
                    <Dialog.Positioner>
                        <Dialog.Content>
                            <Dialog.Header>
                                <Dialog.Title>Remove {displayName}?</Dialog.Title>
                            </Dialog.Header>
                            <Dialog.Body>
                                <Text>
                                    This removes {displayName} from your friends and deletes your
                                    chat history. This cannot be undone.
                                </Text>
                            </Dialog.Body>
                            <Dialog.Footer>
                                <Dialog.ActionTrigger asChild>
                                    <Button variant="outline">Cancel</Button>
                                </Dialog.ActionTrigger>
                                <Button colorPalette="red" onClick={handleRemove}>
                                    Remove
                                </Button>
                            </Dialog.Footer>
                            <Dialog.CloseTrigger asChild>
                                <CloseButton size="sm" />
                            </Dialog.CloseTrigger>
                        </Dialog.Content>
                    </Dialog.Positioner>
                </Portal>
            </Dialog.Root>
        </HStack>
    );
};
