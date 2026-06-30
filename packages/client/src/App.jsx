import { ColorModeButton } from "./components/ui/color-mode";
import { Views } from "./components/Views";
import UserContextProvider from "./contexts/User/UserContextProvider.jsx";

function App() {
    return (
        <>
            <UserContextProvider>
                <Views />
                <ColorModeButton pos="absolute" top="0" right="0" m="1rem" />
            </UserContextProvider>
        </>
    );
}

export default App;
