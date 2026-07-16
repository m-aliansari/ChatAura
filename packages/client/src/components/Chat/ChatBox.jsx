import { Field as FormikField, Form, Formik } from "formik";
import { messageFormSchema, SOCKET_EVENTS } from "@realtime-chatapp/common";
import { Button, Field, HStack, Input, useTabsContext } from "@chakra-ui/react";
import { MessagesContext } from "../../contexts/Messages/MessagesContext.js";
import { FriendsContext } from "../../contexts/Friends/FriendsContext.js";
import { useContext, useRef, useState } from "react";
import { SocketContext } from "../../contexts/Socket/SocketContext.js";
import { bumpConversation } from "../../utils/bumpConversation.js";

export const ChatBox = ({ setNewMessage }) => {
    const { socket } = useContext(SocketContext);
    const { value: user_id } = useTabsContext();
    const { setMessages } = useContext(MessagesContext);
    const { setFriendList } = useContext(FriendsContext);
    const [isTyping, setIsTyping] = useState(false);
    const typingTimeoutRef = useRef(null);

    const handleTyping = () => {
        if (!isTyping) {
            setIsTyping(true);
            socket.emit(SOCKET_EVENTS.TYPING, { to: user_id });
        }

        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
            socket.emit(SOCKET_EVENTS.STOP_TYPING, { to: user_id });
        }, 2000);
    };
    return (
        <Formik
            initialValues={{ message: "" }}
            validationSchema={messageFormSchema}
            onSubmit={(values, actions) => {
                const message = {
                    to: user_id,
                    from: null,
                    content: values.message,
                    messageId: "temp",
                };
                socket.emit(SOCKET_EVENTS.DIRECT_MESSAGE, message, ({ done, message: saved }) => {
                    setNewMessage(null);
                    // Reconcile the optimistic bubble with the persisted row (real id + createdAt).
                    if (done) {
                        setMessages((prevMsgs) => [
                            saved,
                            ...prevMsgs.filter((m) => m.messageId !== "temp"),
                        ]);
                        // Sending is activity too — the recipient gets this via DIRECT_MESSAGE, the
                        // sender reorders here off the ack (which carries the real conversationId).
                        setFriendList((prev) => bumpConversation(prev, saved));
                    }
                });
                setNewMessage({ ...message });

                setIsTyping(false);
                socket.emit(SOCKET_EVENTS.STOP_TYPING, { to: user_id });

                actions.resetForm();
            }}
            validateOnBlur={false}
        >
            {() => (
                <HStack as={Form} w="100%" justify="start" align="start" pb="1.4rem" px="1.4rem">
                    <FormikField name="message">
                        {({ field, meta }) => (
                            <Field.Root invalid={meta.touched && meta.error}>
                                <Input
                                    {...field}
                                    placeholder="Type message here..."
                                    size="lg"
                                    autoComplete="off"
                                    onChange={(e) => {
                                        field.onChange(e);
                                        handleTyping();
                                    }}
                                />
                                <Field.ErrorText>{meta.error}</Field.ErrorText>
                            </Field.Root>
                        )}
                    </FormikField>
                    <Button type="submit" size="lg" colorPalette="teal">
                        Send
                    </Button>
                </HStack>
            )}
        </Formik>
    );
};
