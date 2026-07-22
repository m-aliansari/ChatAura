import {
    Avatar,
    Badge,
    Box,
    Circle,
    Float,
    HStack,
    Icon,
    IconButton,
    Menu,
    Portal,
    Tabs,
    Text,
    VStack,
} from "@chakra-ui/react";
import { MdDelete, MdMoreVert, MdNotificationsOff, MdPushPin } from "react-icons/md";
import { useState } from "react";
import { formatConversationTime } from "../../../utils/formatConversationTime.js";
import { avatarColor } from "../../../utils/avatarColor.js";
import { RemoveFriendDialog } from "../RemoveFriendDialog.jsx";

/**
 * One conversation in the inbox. Four states share the row, each on its own visual channel so they
 * can co-occur without fighting:
 *
 *   online    -> dot badge on the avatar corner (costs zero horizontal space)
 *   unread    -> bold name + full-contrast preview + accent time + count badge (four cues, so it
 *                does not depend on color alone)
 *   selected  -> accent left bar + muted fill (STRUCTURAL, deliberately a different channel from
 *                unread, so a row can be selected and unread at once)
 *   pin/mute  -> glyphs in the right rail (rendered when the flags exist; no behavior yet)
 *
 * The rail's two lines mirror the middle column: "who + how many" above, "what + when" below —
 * the timestamp describes the last message, and the preview *is* the last message.
 */
export const FriendRow = ({ friend }) => {
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Display name replaces the username in the list (older accounts fall back to their username).
    const displayName = friend.full_name || friend.username;
    const preview = friend.lastMessage?.content ?? "";
    const time = formatConversationTime(friend.lastMessage?.createdAt);
    const unread = friend.unreadCount ?? 0;
    const palette = avatarColor(friend.user_id);

    return (
        // `className="group"` (not role="group") is what Chakra's `_groupHover` compiles against —
        // it emits a `.group:hover &` selector. role="group" would also be invalid here: a
        // `tablist` must contain tabs, not grouping elements.
        <Box position="relative" w="100%" className="group">
            <HStack
                as={Tabs.Trigger}
                value={friend.user_id}
                w="100%"
                gap="3"
                align="center"
                textAlign="left"
                px="3"
                py="2.5"
                // The Tabs.Trigger recipe hard-codes height: 40px (it is built for a tab strip, not
                // a list row). Without this override the row clamps to 40px and the 48px avatar
                // spills into the neighbouring rows.
                h="auto"
                minH="72px"
                // Space reserved for the overflow menu so it never overlaps the rail. Reserving is
                // deliberately preferred over an on-hover swap: nothing shifts, and the unread badge
                // never disappears under the menu button.
                pe="2.5rem"
                borderRadius="0"
                position="relative"
                transition="background 0.15s ease"
                _hover={{ bg: "bg.subtle" }}
                // The accent bar is a pseudo-element so it costs no layout and cannot shift the row.
                _before={{
                    content: '""',
                    position: "absolute",
                    insetStart: 0,
                    top: 0,
                    bottom: 0,
                    width: "3px",
                    // Explicit accent, not `colorPalette.solid`: the trigger sets no colorPalette
                    // (the per-user one lives on the Avatar), so that token would fall back to the
                    // theme default and render a grey bar. Matches the unread accent below.
                    bg: "blue.solid",
                    opacity: 0,
                    transition: "opacity 0.15s ease",
                }}
                _selected={{
                    bg: "bg.muted",
                    _before: { opacity: 1 },
                }}
            >
                <Avatar.Root size="md" colorPalette={palette} flexShrink="0">
                    {/* Chakra derives the initials from `name` — no local initials helper needed. */}
                    <Avatar.Fallback name={displayName} />
                    <Float placement="bottom-end" offsetX="1" offsetY="1">
                        {/* `data-status` is the stable hook the realtime-presence E2E test asserts
                            on — it must survive any restyling of this dot. */}
                        <Circle
                            data-status={friend.connected ? "online" : "offline"}
                            aria-label={`${displayName} is ${friend.connected ? "online" : "offline"}`}
                            bg={friend.connected ? "green.500" : "gray.400"}
                            size="10px"
                            outline="0.2em solid"
                            outlineColor="bg"
                        />
                    </Float>
                </Avatar.Root>

                <VStack flex="1" minW="0" gap="0.5" align="stretch">
                    <HStack w="100%" gap="2">
                        <Text
                            truncate
                            flex="1"
                            textAlign="left"
                            fontWeight={unread > 0 ? "bold" : "medium"}
                        >
                            {displayName}
                        </Text>
                        <HStack gap="1" flexShrink="0">
                            {friend.muted && (
                                <Icon as={MdNotificationsOff} boxSize="3.5" color="fg.subtle" />
                            )}
                            {friend.pinned && (
                                <Icon as={MdPushPin} boxSize="3.5" color="fg.subtle" />
                            )}
                            {unread > 0 && (
                                <Badge
                                    // A muted conversation still counts, but stops shouting — the
                                    // badge drops to neutral instead of the accent color.
                                    colorPalette={friend.muted ? "gray" : "blue"}
                                    variant="solid"
                                    borderRadius="full"
                                    minW="1.25rem"
                                    justifyContent="center"
                                    aria-label={`${unread} unread messages`}
                                >
                                    {unread > 99 ? "99+" : unread}
                                </Badge>
                            )}
                        </HStack>
                    </HStack>

                    <HStack w="100%" gap="2">
                        <Text
                            truncate
                            flex="1"
                            textAlign="left"
                            fontSize="sm"
                            color={unread > 0 ? "fg" : "fg.muted"}
                            fontStyle={preview ? "normal" : "italic"}
                        >
                            {/* Placeholder keeps every row the same height — a list where some rows
                                have two lines and some have one reads as ragged. */}
                            {preview || "No messages yet"}
                        </Text>
                        {time && (
                            <Text
                                fontSize="xs"
                                flexShrink="0"
                                color={unread > 0 ? "blue.solid" : "fg.subtle"}
                                fontWeight={unread > 0 ? "semibold" : "normal"}
                            >
                                {time}
                            </Text>
                        )}
                    </HStack>
                </VStack>
            </HStack>

            {/* SIBLING of the trigger, not a child: the row IS a <button> (Tabs.Trigger), and a
                nested button is invalid HTML. Absolutely positioned into the reserved space. */}
            {/* lazyMount keeps the menu item out of the DOM until opened — otherwise every row in
                the list contributes a hidden "Remove <name>" to the accessibility tree. */}
            <Menu.Root lazyMount unmountOnExit>
                <Menu.Trigger asChild>
                    <IconButton
                        aria-label={`Conversation options for ${displayName}`}
                        variant="ghost"
                        size="sm"
                        position="absolute"
                        insetEnd="1"
                        top="50%"
                        transform="translateY(-50%)"
                        // Hidden until hover on pointer devices; always visible at `base`, where
                        // there is no hover to reveal it.
                        opacity={{ base: 1, md: 0 }}
                        _groupHover={{ opacity: 1 }}
                        _focusVisible={{ opacity: 1 }}
                        _open={{ opacity: 1 }}
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
                                {/* Accessible name stays `Remove <username>` — friends.spec.js and
                                    the unit test both match on it. */}
                                <Box flex="1">Remove {displayName}</Box>
                            </Menu.Item>
                        </Menu.Content>
                    </Menu.Positioner>
                </Portal>
            </Menu.Root>

            <RemoveFriendDialog friend={friend} open={confirmOpen} onOpenChange={setConfirmOpen} />
        </Box>
    );
};
