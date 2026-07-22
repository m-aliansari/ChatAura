import { useLocation } from "react-router-dom";
import { ColorModeButton } from "./components/ui/color-mode";
import { Views } from "./components/Views";
import { ROUTE_NAMES } from "./constants/routes.js";
import UserContextProvider from "./contexts/User/UserContextProvider.jsx";

function App() {
    // The floating toggle is for the auth screens only. On /home it is absolutely positioned over
    // the chat header, so the sidebar's account menu owns theme switching there instead.
    const isHome = useLocation().pathname === ROUTE_NAMES.HOME;

    return (
        <UserContextProvider>
            <Views />
            {!isHome && <ColorModeButton pos="absolute" top="0" right="0" m="1rem" />}
        </UserContextProvider>
    );
}

export default App;
