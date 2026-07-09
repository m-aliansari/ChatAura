import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "@chakra-ui/react";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { renderWithProviders } from "../../test/renderWithProviders.jsx";
import { SocketContext } from "../../contexts/Socket/SocketContext.js";
import { MessagesContext } from "../../contexts/Messages/MessagesContext.js";
import { ChatBox } from "./ChatBox.jsx";

function setup(emitImpl) {
    const socket = { emit: vi.fn(emitImpl) };
    const setMessages = vi.fn();
    const setNewMessage = vi.fn();
    renderWithProviders(
        <SocketContext.Provider value={{ socket }}>
            <MessagesContext.Provider value={{ setMessages }}>
                <Tabs.Root value="bob-id">
                    <ChatBox setNewMessage={setNewMessage} />
                </Tabs.Root>
            </MessagesContext.Provider>
        </SocketContext.Provider>,
    );
    return { socket, setMessages, setNewMessage };
}

describe("ChatBox", () => {
    it("emits DIRECT_MESSAGE to the active conversation and optimistically renders", async () => {
        // Only DIRECT_MESSAGE passes an ack callback; TYPING/STOP_TYPING do not. The server
        // acks with the persisted message (real id + messageId), which the client commits.
        const saved = {
            id: 1,
            messageId: "m1",
            to: "bob-id",
            from: "me-id",
            content: "hello",
            createdAt: "2026-07-09T00:00:00.000Z",
        };
        const { socket, setMessages, setNewMessage } = setup((event, message, cb) => {
            if (typeof cb === "function") cb({ done: true, message: saved });
        });

        await userEvent.type(screen.getByPlaceholderText("Type message here..."), "hello");
        await userEvent.click(screen.getByRole("button", { name: "Send" }));

        expect(socket.emit).toHaveBeenCalledWith(
            SOCKET_EVENTS.DIRECT_MESSAGE,
            expect.objectContaining({ to: "bob-id", content: "hello" }),
            expect.any(Function),
        );
        // optimistic preview, then the persisted row committed on ack
        expect(setNewMessage).toHaveBeenCalled();
        const committed = setMessages.mock.calls.at(-1)[0];
        expect(committed([])).toEqual([saved]);
    });

    it("drops the optimistic 'temp' entry when committing the persisted message", async () => {
        const saved = { id: 2, messageId: "m2", to: "bob-id", from: "me-id", content: "hello" };
        const { setMessages } = setup((event, message, cb) => {
            if (typeof cb === "function") cb({ done: true, message: saved });
        });

        await userEvent.type(screen.getByPlaceholderText("Type message here..."), "hello");
        await userEvent.click(screen.getByRole("button", { name: "Send" }));

        const committed = setMessages.mock.calls.at(-1)[0];
        const prev = [
            { messageId: "temp", to: "bob-id", from: null, content: "hello" },
            { id: 1, messageId: "m1", to: "bob-id", from: "me-id", content: "earlier" },
        ];
        // the stale optimistic entry is filtered out; the persisted row leads
        expect(committed(prev).map((m) => m.messageId)).toEqual(["m2", "m1"]);
    });

    it("does not commit anything when the server rejects the send", async () => {
        const { setMessages, setNewMessage } = setup((event, message, cb) => {
            if (typeof cb === "function") cb({ done: false, errorMsg: "Not friends" });
        });

        await userEvent.type(screen.getByPlaceholderText("Type message here..."), "hello");
        await userEvent.click(screen.getByRole("button", { name: "Send" }));

        // the optimistic preview is cleared, but nothing is added to the message list
        expect(setNewMessage).toHaveBeenCalledWith(null);
        expect(setMessages).not.toHaveBeenCalled();
    });

    it("emits TYPING on keystroke and STOP_TYPING once the user idles for 2s", () => {
        // fireEvent (not userEvent) so the debounce can be driven by fake timers.
        vi.useFakeTimers();
        try {
            const { socket } = setup();

            fireEvent.change(screen.getByPlaceholderText("Type message here..."), {
                target: { value: "h" },
            });
            expect(socket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.TYPING, { to: "bob-id" });
            expect(socket.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.STOP_TYPING, {
                to: "bob-id",
            });

            act(() => vi.advanceTimersByTime(2000));
            expect(socket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.STOP_TYPING, { to: "bob-id" });
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not emit an empty message", async () => {
        const { socket } = setup();
        await userEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(screen.getByText("Message required")).toBeInTheDocument());
        expect(socket.emit).not.toHaveBeenCalled();
    });

    it("does not emit a whitespace-only message", async () => {
        // SPEC: whitespace is blocked by messageFormSchema, so no DIRECT_MESSAGE is
        // sent (the typing indicator may still fire on keystroke — that's fine).
        const { socket } = setup();
        await userEvent.type(screen.getByPlaceholderText("Type message here..."), "     ");
        await userEvent.click(screen.getByRole("button", { name: "Send" }));

        const sentMessages = socket.emit.mock.calls.filter(
            ([event]) => event === SOCKET_EVENTS.DIRECT_MESSAGE,
        );
        expect(sentMessages).toHaveLength(0);
    });
});
