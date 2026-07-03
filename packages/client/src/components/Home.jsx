import { Grid, GridItem, Tabs, useBreakpointValue, useTabs } from "@chakra-ui/react";
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

    // Mobile: single pane. Show the friend list until a chat is opened, then
    // swap to the conversation with a back button (tabs.value drives the swap).
    if (isMobile) {
        return (
            <Tabs.RootProvider value={tabs} h="100dvh" variant="enclosed">
                {tabs.value ? <ChatMessages onBack={() => tabs.setValue(null)} /> : <SideBar />}
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
