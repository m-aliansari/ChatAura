import { initializeApp } from "firebase/app";
import { getMessaging, onMessage } from 'firebase/messaging';

const firebaseConfig = {
    apiKey: "AIzaSyBr8DFHXWEkdbWil9KWqk6hgKq5IFxDnMw",
    authDomain: "vite-realtime-chatapp.firebaseapp.com",
    projectId: "vite-realtime-chatapp",
    storageBucket: "vite-realtime-chatapp.firebasestorage.app",
    messagingSenderId: "435490843813",
    appId: "1:435490843813:web:fbcc3d51f65b4081c9f14c",
    measurementId: "G-N80XEQW20J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);


export const messaging = getMessaging(app);

// Handle foreground notifications
onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);

    // Optionally display a custom notification here
    // For example:
    // new Notification(payload.notification.title, {
    //     body: payload.notification.body,
    //     icon: payload.notification.icon
    // });
});