import { Button, Heading, HStack, VStack, Separator, Tabs, Dialog } from "@chakra-ui/react";
import "../../../styles/scrollbar.css";

import { MdAdd } from "react-icons/md";
import { FriendsContext } from "../../../contexts/Friends/FriendsContext";
import { useContext } from "react";
import { AddFriendModal } from "./AddFriendModal";
import { FriendRow } from "./FriendRow.jsx";
import { FlatLogo } from "../../common/Logo/FlatLogo.jsx";
import { useLogout } from "../../../hooks/useLogout.jsx";

export const SideBar = () => {
    const { friendList } = useContext(FriendsContext);
    const logout = useLogout();

    return (
        <Dialog.Root placement="center" motionPreset="slide-in-bottom">
            <VStack py="1.4rem">
                <FlatLogo width="150px" />
                <HStack justify="center" gap="15px" w="100%">
                    <Heading size="md">Add Friend</Heading>
                    <Dialog.Trigger asChild>
                        <Button variant="surface" aria-label="Add Friend">
                            <MdAdd size={10} />
                        </Button>
                    </Dialog.Trigger>
                    <Button variant="outline" colorPalette="red" size="sm" onClick={logout}>
                        Logout
                    </Button>
                </HStack>
                <Separator />
                {friendList?.length ? (
                    <VStack
                        as={Tabs.List}
                        w="100%"
                        p="2rem"
                        maxH="82vh"
                        overflowY="auto"
                        backgroundImage={{
                            base: "linear-gradient(to right, #f5f5f5, #e0e0e0)", // light gray gradient for light mode
                            _dark: "linear-gradient(to right, #131313ff, #4a4a4a)", // dark gray gradient for dark mode
                        }}
                        borderRadius="12px" /* Rounded corners for a card-like design */
                        boxShadow="lg" /* Soft shadow for a modern look */
                    >
                        {friendList.map((friend) => (
                            <FriendRow key={friend.user_id} friend={friend} />
                        ))}
                    </VStack>
                ) : (
                    <></>
                )}
            </VStack>
            <AddFriendModal />
        </Dialog.Root>
    );
};
