import {
    Box,
    Heading,
    HStack,
    IconButton,
    Tabs,
    Text,
    useTabsContext,
    VStack,
} from "@chakra-ui/react";
import { MdArrowBack } from "react-icons/md";
import { FriendsContext } from "../../contexts/Friends/FriendsContext.js";
import { useContext, useEffect, useRef, useState } from "react";
import { MessagesContext } from "../../contexts/Messages/MessagesContext.js";
import { ChatBox } from "./ChatBox.jsx";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { keyframes } from "@emotion/react";
import { SocketContext } from "../../contexts/Socket/SocketContext.js";
import { mergeMessages } from "../../utils/mergeMessages.js";

const dotPulse = keyframes(`
  0%   { opacity: 0.2; transform: scale(1); }
  20%  { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0.2; transform: scale(1); }
`);

export const ChatMessages = ({ onBack }) => {
    const { socket } = useContext(SocketContext);
    const { friendList } = useContext(FriendsContext);
    const { messages, setMessages, conversationMeta, setConversationMeta } =
        useContext(MessagesContext);
    const messagesContainerRefs = useRef({});
    const [newMessage, setNewMessage] = useState(null);
    const { value: currentTab } = useTabsContext();
    const [isTyping, setIsTyping] = useState(false);

    // Refs so the scroll handler reads current messages/meta without resubscribing or
    // capturing stale closures.
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const conversationMetaRef = useRef(conversationMeta);
    conversationMetaRef.current = conversationMeta;

    useEffect(() => {
        socket.on(SOCKET_EVENTS.MESSAGES, (incoming) => {
            setMessages((prev) => mergeMessages(prev, incoming));
        });

        socket.on(SOCKET_EVENTS.DIRECT_MESSAGE, (newMessage) => {
            setMessages((prev) => mergeMessages(prev, [newMessage]));
        });
        socket.on(SOCKET_EVENTS.TYPING, ({ from }) => {
            if (from === currentTab) setIsTyping(true);
        });

        socket.on(SOCKET_EVENTS.STOP_TYPING, ({ from }) => {
            if (from === currentTab) setIsTyping(false);
        });

        return () => {
            socket.off(SOCKET_EVENTS.MESSAGES);
            socket.off(SOCKET_EVENTS.DIRECT_MESSAGE);
            socket.off(SOCKET_EVENTS.NEW_MESSAGE_ID);
            socket.off(SOCKET_EVENTS.TYPING);
            socket.off(SOCKET_EVENTS.STOP_TYPING);
        };
    }, [setMessages, currentTab, socket]);

    // Auto-scroll to newest — but only when the current conversation gains a *newer* message
    // (a live/sent message) or the tab changes. Loading OLDER messages must NOT yank the view
    // back to the bottom, or infinite scroll is unusable.
    const newestIdRef = useRef(0);
    const lastTabRef = useRef(currentTab);
    useEffect(() => {
        const el = messagesContainerRefs.current?.[currentTab];
        if (!el) return;

        const newestId = messages.reduce(
            (max, m) => (m.to === currentTab || m.from === currentTab ? Math.max(max, m.id) : max),
            0,
        );
        const tabChanged = lastTabRef.current !== currentTab;
        lastTabRef.current = currentTab;

        if (tabChanged || newestId > newestIdRef.current) {
            el.scrollTo({ top: 0, behavior: tabChanged ? "auto" : "smooth" });
        }
        newestIdRef.current = newestId;
    }, [messages, currentTab]);

    // Fetch the previous page of a conversation when the user scrolls to the oldest message.
    const loadOlder = (friendUserId) => {
        const meta = conversationMetaRef.current[friendUserId] ?? {
            hasMore: true,
            loading: false,
        };
        if (!meta.hasMore || meta.loading) return;

        // Guard immediately via the ref — scroll can fire repeatedly before state commits.
        conversationMetaRef.current = {
            ...conversationMetaRef.current,
            [friendUserId]: { ...meta, loading: true },
        };
        setConversationMeta(conversationMetaRef.current);

        const convo = messagesRef.current.filter(
            (m) => m.to === friendUserId || m.from === friendUserId,
        );
        const before = convo.length ? Math.min(...convo.map((m) => m.id)) : undefined;

        socket.emit(
            SOCKET_EVENTS.LOAD_OLDER,
            { friendUserId, before },
            ({ messages: older, hasMore }) => {
                setMessages((prev) => mergeMessages(prev, older));
                conversationMetaRef.current = {
                    ...conversationMetaRef.current,
                    [friendUserId]: { hasMore, loading: false },
                };
                setConversationMeta(conversationMetaRef.current);
            },
        );
    };

    const handleScroll = (friendUserId) => (e) => {
        const el = e.currentTarget;
        // column-reverse: newest sits at scrollTop≈0; the oldest edge is reached as |scrollTop|
        // approaches (scrollHeight - clientHeight).
        const distanceFromOldest = el.scrollHeight - el.clientHeight - Math.abs(el.scrollTop);
        if (distanceFromOldest < 80) loadOlder(friendUserId);
    };

    return friendList?.length ? (
        <>
            {friendList.map((friend) => (
                <Tabs.Content
                    key={`messages:${friend.username}`}
                    value={friend.user_id}
                    as={VStack}
                    h="100dvh" // dynamic vh so the input isn't clipped by mobile browser chrome
                    w="100%"
                    p="0"
                    spacing="0"
                >
                    {/* Fixed Heading (with a back button on mobile) */}
                    <HStack w="100%" p="1rem" justify="center" position="relative">
                        {onBack && (
                            <IconButton
                                aria-label="Back to friends"
                                variant="ghost"
                                onClick={onBack}
                                position="absolute"
                                left="0.5rem"
                            >
                                <MdArrowBack />
                            </IconButton>
                        )}
                        <Heading fontSize="2xl" textAlign="center">
                            {friend.username}
                        </Heading>
                    </HStack>

                    {/* Scrollable Messages */}
                    <Box
                        w="100%"
                        overflowY="auto"
                        display="flex"
                        flexDir="column-reverse"
                        px="1rem"
                        ref={(el) => (messagesContainerRefs.current[friend.user_id] = el)}
                        onScroll={handleScroll(friend.user_id)}
                        data-testid={`messages-scroll:${friend.user_id}`}
                        flex="1"
                    >
                        <VStack justify="flex-start" flexDir="column-reverse" mt="auto">
                            {isTyping && friend.user_id === currentTab && (
                                <HStack
                                    px="1rem"
                                    py="0.5rem"
                                    alignSelf="flex-start"
                                    spacing="0.25rem"
                                    fontSize="sm"
                                    fontStyle="italic"
                                    color="gray.500"
                                >
                                    <Text>{friend.username} is typing</Text>
                                    <HStack spacing="0.25rem">
                                        {[0, 1, 2].map((_, i) => (
                                            <Box
                                                key={i}
                                                as="span"
                                                w="4px"
                                                h="4px"
                                                borderRadius="full"
                                                bg="gray.500"
                                                animation={`${dotPulse} 1.2s infinite`}
                                                animationDelay={`${i * 0.2}s`}
                                            />
                                        ))}
                                    </HStack>
                                </HStack>
                            )}
                            {newMessage && (
                                <Text
                                    m={"1rem 0 0 auto !important"}
                                    fontSize="lg"
                                    bg={"blue.100"}
                                    color="black"
                                    p="0.5rem 1rem"
                                    maxW="60%"
                                    borderRadius="10px"
                                    wordBreak="break-word"
                                >
                                    {newMessage.content}
                                </Text>
                            )}
                            {messages
                                .filter(
                                    (message) =>
                                        message.to === friend.user_id ||
                                        message.from === friend.user_id,
                                )
                                .map((message) => (
                                    <Text
                                        m={
                                            message.to === friend.user_id
                                                ? "1rem 0 0 auto !important"
                                                : "1rem auto 0 0 !important"
                                        }
                                        key={`msg:${friend.username}.${message.messageId}`}
                                        fontSize="lg"
                                        bg={message.to === friend.user_id ? "blue.100" : "gray.100"}
                                        color="black"
                                        p="0.5rem 1rem"
                                        maxW="60%"
                                        borderRadius="10px"
                                        wordBreak="break-word"
                                    >
                                        {message.content}
                                    </Text>
                                ))}
                        </VStack>
                    </Box>

                    {/* Chat Input Form */}
                    <Box w="100%" p="1rem" borderTop="1px solid #eee">
                        <ChatBox setNewMessage={setNewMessage} />
                    </Box>
                </Tabs.Content>
            ))}
        </>
    ) : (
        <VStack justify="center" pt="5rem" w="100%" textAlign="center" fontSize="lg">
            <Tabs.Content>
                <Text>No friends added. Click add friend to start chatting</Text>
            </Tabs.Content>
        </VStack>
    );
};
