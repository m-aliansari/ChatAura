import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LOCAL_STORAGE_TOKEN_KEY } from "../../constants/auth.js";
import { API_BASE_URL, FIREBASE_VAPID_KEY } from "../../constants/api.js";
import { ROUTE_NAMES } from "../../constants/routes.js";
import { UserContext } from "./UserContext.js";
import { usePrevious } from "../../hooks/usePrevious.jsx";
import { getToken } from "firebase/messaging";
import { messaging } from "../../utils/firebase.js";
import { API_ROUTES } from "@realtime-chatapp/common";

const UserContextProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        let token = null;
        try {
            token = localStorage?.getItem(LOCAL_STORAGE_TOKEN_KEY) ?? null;
        } catch {
            token = null;
        }
        return {
            loggedIn: null,
            token,
        };
    });
    const navigate = useNavigate();
    const prevUser = usePrevious(user);

    useEffect(() => {
        if (!prevUser?.loggedIn && user?.loggedIn) {
            getToken(messaging, { vapidKey: FIREBASE_VAPID_KEY }).then((fcmToken) => {
                fetch(`${API_BASE_URL}${API_ROUTES.FCM.TOKEN.SAVE}`, {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${user.token}`,
                        "Content-Type": "application/json",
                    },
                    credentials: "include",
                    body: JSON.stringify({ fcmToken }),
                })
                    .then((res) => {
                        if (!res.ok) {
                            console.log("Failed to save FCM token");
                            return;
                        }
                    })
                    .catch((error) => {
                        console.error("Error saving FCM token:", error);
                    });
            });
        }
    }, [user?.loggedIn, prevUser?.loggedIn, user?.token]);

    useEffect(() => {
        fetch(`${API_BASE_URL}${API_ROUTES.AUTH.LOGIN}`, {
            credentials: "include",
            headers: {
                authorization: `Bearer ${user?.token}`,
            },
        })
            .catch(() => {
                localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
                return setUser({ loggedIn: false });
            })
            .then((res) => {
                if (!res || !res.ok || res.status >= 400) {
                    localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
                    return setUser({ loggedIn: false });
                }
                return res.json();
            })
            .then((data) => {
                if (!data || !data.loggedIn) {
                    localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
                    return setUser({ loggedIn: false });
                }
                setUser({ ...data });
                return navigate(ROUTE_NAMES.HOME);
            })
            .catch(() => {
                return setUser({ loggedIn: false });
            });
    }, [navigate, user.token]);

    return <UserContext.Provider value={{ user, setUser }}>{children}</UserContext.Provider>;
};

export default UserContextProvider;
