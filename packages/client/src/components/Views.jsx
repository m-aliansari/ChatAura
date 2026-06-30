import { useContext, useEffect } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { Login } from "./Auth/Login";
import { Signup } from "./Auth/Signup";
import { PrivateRoutes } from "./PrivateRoutes";
import { Text } from "@chakra-ui/react";
import { Home } from "./Home";
import { FriendsContextProvider } from "../contexts/Friends/FriendsContextProvider.jsx";
import { MessagesContextProvider } from "../contexts/Messages/MessagesContextProvider.jsx";
import { UserContext } from "../contexts/User/UserContext.js";
import { SocketContextProvide } from "../contexts/Socket/SocketContextProvide.jsx";

export const Views = () => {
    const { user } = useContext(UserContext);
    const navigate = useNavigate();
    useEffect(() => {
        const handleMessage = (event) => {
            console.log("got message OPEN_CHAT", event.data);

            if (event.data.type === "OPEN_CHAT" && event.data.userId) {
                // Navigate to the chat with the specific user
                navigate(`/home?userId=${event.data.userId}`);
            }
        };

        navigator.serviceWorker.addEventListener("message", handleMessage);
        return () => {
            navigator.serviceWorker.removeEventListener("message", handleMessage);
        };
    }, [navigate]);
    return user.loggedIn === null ? (
        <Text>Loading....</Text>
    ) : (
        <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/register" element={<Signup />} />
            <Route element={<PrivateRoutes />}>
                <Route
                    path="/home"
                    element={
                        <SocketContextProvide>
                            <FriendsContextProvider>
                                <MessagesContextProvider>
                                    <Home />
                                </MessagesContextProvider>
                            </FriendsContextProvider>
                        </SocketContextProvide>
                    }
                />
            </Route>
            <Route path="*" element={<Login />} />
        </Routes>
    );
};
