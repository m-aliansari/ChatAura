import { Grid, GridItem, Tabs, useTabs } from "@chakra-ui/react";
import { SideBar } from "./Chat/FriendList/SideBar";
import { ChatMessages } from "./Chat/ChatMessages";
import { useSocketSetup } from "../hooks/useSocketSetup.jsx";
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";

export const Home = () => {
  const tabs = useTabs();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get("userId");
  useSocketSetup(tabs);

  useEffect(() => {
    if (userId) {
      console.log("User ID from search params:", userId);
      // Set the active tab directly using the userId
      tabs.setValue(userId);
    }
  }, [userId, tabs]);

  return (
    <Tabs.RootProvider
      value={tabs}
      templateColumns={"repeat(10, 1fr)"}
      h="100vh"
      as={Grid}
      variant="enclosed"
    >
      <GridItem colSpan={"3"} borderRight={"1px solid gray"}>
        <SideBar />
      </GridItem>
      <GridItem colSpan={"7"}>
        <ChatMessages />
      </GridItem>
    </Tabs.RootProvider>
  );
};
