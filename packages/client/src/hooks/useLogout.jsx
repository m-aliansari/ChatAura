import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { deleteToken, getToken } from "firebase/messaging";
import { API_ROUTES } from "@realtime-chatapp/common";
import { UserContext } from "../contexts/User/UserContext.js";
import { SocketContext } from "../contexts/Socket/SocketContext.js";
import { FriendsContext } from "../contexts/Friends/FriendsContext.js";
import { MessagesContext } from "../contexts/Messages/MessagesContext.js";
import { messaging } from "../utils/firebase.js";
import { API_BASE_URL, FIREBASE_VAPID_KEY } from "../constants/api.js";
import { LOCAL_STORAGE_TOKEN_KEY } from "../constants/auth.js";
import { ROUTE_NAMES } from "../constants/routes.js";

// Best-effort: remove this device's FCM token server-side and unregister the
// browser subscription. Bounded by a timeout because getToken() can hang
// forever when notification permission was never granted.
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);

const cleanupFcmToken = async (token) => {
  try {
    const fcmToken = await withTimeout(
      getToken(messaging, { vapidKey: FIREBASE_VAPID_KEY }),
      4000
    );
    if (!fcmToken) return;

    await fetch(`${API_BASE_URL}${API_ROUTES.FCM.TOKEN.DELETE}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ fcmToken }),
    });
    await deleteToken(messaging);
  } catch (error) {
    console.error("FCM cleanup on logout failed:", error);
  }
};

export const useLogout = () => {
  const { user, setUser } = useContext(UserContext);
  const { socket } = useContext(SocketContext);
  const { setFriendList } = useContext(FriendsContext);
  const { setMessages } = useContext(MessagesContext);
  const navigate = useNavigate();

  const logout = () => {
    // Capture the token before we clear it — FCM cleanup needs it.
    const token = user.token;

    // Local logout runs immediately and is NEVER gated on FCM cleanup.
    // (getToken can hang indefinitely if notification permission was never
    // granted, so awaiting it here would trap the user logged-in.)
    socket.disconnect();
    setFriendList([]);
    setMessages([]);
    localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
    setUser({ loggedIn: false });
    navigate(ROUTE_NAMES.LOGIN);

    // Fire-and-forget best-effort FCM cleanup; never blocks logout.
    cleanupFcmToken(token);
  };

  return logout;
};
