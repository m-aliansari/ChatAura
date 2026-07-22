import { Button, CloseButton, Dialog, Portal, Text } from "@chakra-ui/react";
import { useContext } from "react";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { SocketContext } from "../../contexts/Socket/SocketContext.js";
import { FriendsContext } from "../../contexts/Friends/FriendsContext.js";
import { MessagesContext } from "../../contexts/Messages/MessagesContext.js";
import { useTabsContext } from "@chakra-ui/react";

/**
 * Confirm-and-remove for a friendship. Controlled, so the two entry points that need it — the
 * conversation row's overflow menu and the chat header's overflow menu — share ONE component and
 * one emit path. Duplicating this would mean two places to keep the local cleanup (friend list,
 * messages, active tab) in sync with the server.
 */
export const RemoveFriendDialog = ({ friend, open, onOpenChange }) => {
    const { socket } = useContext(SocketContext);
    const { setFriendList } = useContext(FriendsContext);
    const { setMessages } = useContext(MessagesContext);
    const tabs = useTabsContext();

    const displayName = friend.full_name || friend.username;

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
                onOpenChange(false);
            },
        );
    };

    return (
        <Dialog.Root
            open={open}
            onOpenChange={(e) => onOpenChange(e.open)}
            placement="center"
            // Deliberately the default `dialog` role, NOT `alertdialog`: `getByRole("dialog")` does
            // not match an alertdialog, and friends.spec.js locates this by that role. Guarded by a
            // unit test so a role change fails fast instead of timing out in the E2E run.
            // One of these is rendered per conversation row. Without lazyMount the whole list would
            // carry a hidden dialog each, and their headings would collide in the accessibility
            // tree with the chat header's copy of the same dialog.
            lazyMount
            unmountOnExit
        >
            <Portal>
                <Dialog.Backdrop />
                <Dialog.Positioner>
                    <Dialog.Content>
                        <Dialog.Header>
                            {/* Title text is a test contract (friends.spec.js matches the dialog by
                                its accessible name) — keep the `Remove <name>?` phrasing. */}
                            <Dialog.Title>Remove {displayName}?</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Text>
                                This removes {displayName} from your friends and deletes your chat
                                history. This cannot be undone.
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
    );
};
