import { Box, Heading, HStack, IconButton, Menu, Portal, Spacer } from "@chakra-ui/react";
import { MdArrowBack, MdDelete, MdMoreVert } from "react-icons/md";
import { useState } from "react";
import { RemoveFriendDialog } from "./RemoveFriendDialog.jsx";

/**
 * Header of an open conversation. Its own component (rather than inline in ChatMessages) because
 * ChatMessages renders one per friend inside a `.map()`, and the confirm dialog needs per-header
 * state — hooks cannot live inside a map callback.
 */
export const ChatHeader = ({ friend, onBack }) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const displayName = friend.full_name || friend.username;

    return (
        <HStack w="100%" px="2" py="3" gap="2" borderBottomWidth="1px">
            {onBack && (
                <IconButton aria-label="Back to friends" variant="ghost" onClick={onBack}>
                    <MdArrowBack />
                </IconButton>
            )}
            <Heading fontSize="lg" truncate ps={onBack ? "0" : "2"}>
                {displayName}
            </Heading>
            <Spacer />
            <Menu.Root lazyMount unmountOnExit>
                <Menu.Trigger asChild>
                    <IconButton
                        aria-label={`Conversation options for ${displayName}`}
                        variant="ghost"
                        size="sm"
                    >
                        <MdMoreVert />
                    </IconButton>
                </Menu.Trigger>
                <Portal>
                    <Menu.Positioner>
                        <Menu.Content>
                            <Menu.Item
                                value="remove"
                                color="fg.error"
                                _hover={{ bg: "bg.error", color: "fg.error" }}
                                onSelect={() => setConfirmOpen(true)}
                            >
                                <MdDelete />
                                <Box flex="1">Remove {displayName}</Box>
                            </Menu.Item>
                        </Menu.Content>
                    </Menu.Positioner>
                </Portal>
            </Menu.Root>

            <RemoveFriendDialog friend={friend} open={confirmOpen} onOpenChange={setConfirmOpen} />
        </HStack>
    );
};
