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
    useTabsContext,
} from "@chakra-ui/react";
import { MdDelete } from "react-icons/md";
import { useContext, useState } from "react";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { SocketContext } from "../../../contexts/Socket/SocketContext.js";
import { FriendsContext } from "../../../contexts/Friends/FriendsContext.js";
import { MessagesContext } from "../../../contexts/Messages/MessagesContext.js";

export const FriendRow = ({ friend }) => {
    const { socket } = useContext(SocketContext);
    const { setFriendList } = useContext(FriendsContext);
    const { setMessages } = useContext(MessagesContext);
    const tabs = useTabsContext();
    const [open, setOpen] = useState(false);

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
        <HStack w="100%" justify="space-between">
            <HStack as={Tabs.Trigger} value={friend.user_id} flex="1">
                <Circle
                    data-status={friend.connected ? "online" : "offline"}
                    aria-label={`${friend.username} is ${friend.connected ? "online" : "offline"}`}
                    bg={friend.connected ? "green.500" : "red.500"}
                    w="20px"
                    h="20px"
                />
                <Text>{friend.username}</Text>
            </HStack>
            <Dialog.Root open={open} onOpenChange={(e) => setOpen(e.open)} placement="center">
                <Dialog.Trigger asChild>
                    <IconButton
                        aria-label={`Remove ${friend.username}`}
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
                                <Dialog.Title>Remove {friend.username}?</Dialog.Title>
                            </Dialog.Header>
                            <Dialog.Body>
                                <Text>
                                    This removes {friend.username} from your friends and deletes
                                    your chat history. This cannot be undone.
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
