import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { Provider } from "./components/ui/provider.jsx";
import { HashRouter } from "react-router-dom";

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <HashRouter>
            <Provider>
                <App />
            </Provider>
        </HashRouter>
    </StrictMode>,
);
