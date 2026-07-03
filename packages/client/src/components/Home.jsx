import { Box, Flex, Grid, GridItem, Tabs, useBreakpointValue, useTabs } from "@chakra-ui/react";
import { SideBar } from "./Chat/FriendList/SideBar";
import { ChatMessages } from "./Chat/ChatMessages";
import { useSocketSetup } from "../hooks/useSocketSetup.jsx";
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";

export const Home = () => {
    const tabs = useTabs();
    const [searchParams] = useSearchParams();
    const userId = searchParams.get("userId");
    const isMobile = useBreakpointValue({ base: true, md: false });
    useSocketSetup(tabs);

    useEffect(() => {
        if (userId) {
            // Set the active tab directly using the userId
            tabs.setValue(userId);
        }
    }, [userId, tabs]);

    // Mobile: single pane. Both the friend list and the conversation are mounted
    // side by side in a 200%-wide track; opening a chat slides the track left so
    // the conversation glides in from the right, and Back slides it back to the
    // list (tabs.value drives the transform).
    if (isMobile) {
        const showChat = Boolean(tabs.value);
        return (
            <Tabs.RootProvider
                value={tabs}
                h="100dvh"
                w="100%"
                overflowX="hidden"
                variant="enclosed"
            >
                <Flex
                    w="200%"
                    h="100dvh"
                    transition="transform 0.3s ease"
                    transform={showChat ? "translateX(-50%)" : "translateX(0)"}
                >
                    <Box w="50%" h="100dvh" overflowY="auto">
                        <SideBar />
                    </Box>
                    <Box w="50%" h="100dvh">
                        <ChatMessages onBack={() => tabs.setValue(null)} />
                    </Box>
                </Flex>
            </Tabs.RootProvider>
        );
    }

    // Desktop / tablet: two-pane layout, list + conversation side by side.
    return (
        <Tabs.RootProvider
            value={tabs}
            templateColumns={{ base: "1fr", md: "repeat(10, 1fr)" }}
            h="100vh"
            as={Grid}
            variant="enclosed"
        >
            <GridItem colSpan={{ base: 10, md: 3 }} borderRight={"1px solid gray"}>
                <SideBar />
            </GridItem>
            <GridItem colSpan={{ base: 10, md: 7 }}>
                <ChatMessages />
            </GridItem>
        </Tabs.RootProvider>
    );
};
