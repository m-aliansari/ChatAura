import {
  Box,
  Heading,
  HStack,
  Tabs,
  Text,
  useTabsContext,
  VStack,
} from "@chakra-ui/react";
import { FriendsContext } from "../../contexts/Friends/FriendsContext.js";
import { useContext, useEffect, useRef, useState } from "react";
import { MessagesContext } from "../../contexts/Messages/MessagesContext.js";
import { ChatBox } from "./ChatBox.jsx";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { keyframes } from "@emotion/react";
import { SocketContext } from "../../contexts/Socket/SocketContext.js";

const dotPulse = keyframes(`
  0%   { opacity: 0.2; transform: scale(1); }
  20%  { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0.2; transform: scale(1); }
`);

export const ChatMessages = () => {
  const { socket } = useContext(SocketContext);
  const { friendList } = useContext(FriendsContext);
  const { messages, setMessages } = useContext(MessagesContext);
  const messagesContainerRefs = useRef({});
  const [newMessage, setNewMessage] = useState(null);
  const { value: currentTab } = useTabsContext();
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    socket.on(SOCKET_EVENTS.MESSAGES, (messages) => {
      setMessages([...messages]);
    });

    socket.on(SOCKET_EVENTS.DIRECT_MESSAGE, (newMessage) => {
      setMessages((prevMsgs) => {
        const messageExists = prevMsgs.find(
          (msg) => msg.messageId === newMessage.messageId
        );
        if (messageExists) return prevMsgs;
        return [newMessage, ...prevMsgs];
      });
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

  useEffect(() => {
    const el = messagesContainerRefs.current?.[currentTab];
    if (el) {
      el.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [messages, currentTab]);

  return friendList?.length ? (
    <>
      {friendList.map((friend) => (
        <Tabs.Content
          key={`messages:${friend.username}`}
          value={friend.user_id}
          as={VStack}
          h="100vh" // or 100% if the parent has constrained height
          w="100%"
          p="0"
          spacing="0"
        >
          {/* Fixed Heading */}
          <Heading fontSize="2xl" w="100%" p="1rem" textAlign="center">
            {friend.username}
          </Heading>

          {/* Scrollable Messages */}
          <Box
            w="100%"
            overflowY="auto"
            display="flex"
            flexDir="column-reverse"
            px="1rem"
            ref={(el) => (messagesContainerRefs.current[friend.user_id] = el)}
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
                >
                  {newMessage.content}
                </Text>
              )}
              {messages
                .filter(
                  (message) =>
                    message.to === friend.user_id ||
                    message.from === friend.user_id
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
    <VStack
      justify="center"
      pt="5rem"
      w="100%"
      textAlign="center"
      fontSize="lg"
    >
      <Tabs.Content>
        <Text>No friends added. Click add friend to start chatting</Text>
      </Tabs.Content>
    </VStack>
  );
};
