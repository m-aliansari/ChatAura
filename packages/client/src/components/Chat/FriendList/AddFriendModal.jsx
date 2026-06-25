import {
  Button,
  CloseButton,
  Dialog,
  Heading,
  Portal,
  useDialogContext,
} from "@chakra-ui/react";
import { TextField } from "../../common/TextField";
import { Form, Formik } from "formik";
import { friendFormSchema, SOCKET_EVENTS } from "@realtime-chatapp/common";

import { useContext, useEffect, useState } from "react";
import { FriendsContext } from "../../../contexts/Friends/FriendsContext.js";
import { SocketContext } from "../../../contexts/Socket/SocketContext.js";

export const AddFriendModal = () => {
  const { socket } = useContext(SocketContext);
  const [error, setError] = useState("");
  const dialog = useDialogContext();
  const { setFriendList } = useContext(FriendsContext);
  const handleSubmit = (values, actions) => {
    console.log("form submitted");
    console.log(socket);
    
    socket.emit(
      SOCKET_EVENTS.ADD_FRIEND,
      values.username,
      ({ errorMsg, done, addedFriend }) => {
        if (done) {
          setError("");
          setFriendList((c) => [{ ...addedFriend }, ...c]);
          return dialog.setOpen(false);
        }
        setError(errorMsg);
      }
    );
    actions.resetForm();
  };
  useEffect(() => {
    if (!dialog.open) setError("");
  }, [dialog.open]);
  return (
    <Portal>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Add a friend!</Dialog.Title>
          </Dialog.Header>
          <Formik
            initialValues={{ username: "" }}
            onSubmit={handleSubmit}
            validationSchema={friendFormSchema}
          >
            <Form>
              <Dialog.Body>
                <Heading
                  as="p"
                  color="red.500"
                  textAlign="center"
                  fontSize="xl"
                >
                  {error}
                </Heading>
                <TextField
                  label="Friend's username"
                  placeholder="Enter Friend's username"
                  autoComplete="off"
                  name="username"
                />
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button variant="outline">Cancel</Button>
                </Dialog.ActionTrigger>
                <Button type="submit">Submit</Button>
              </Dialog.Footer>
            </Form>
          </Formik>
          <Dialog.CloseTrigger asChild>
            <CloseButton size="sm" />
          </Dialog.CloseTrigger>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  );
};
