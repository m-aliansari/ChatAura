/* eslint-disable no-undef */

importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "YOUR_API_KEY",
    authDomain: "your-app.firebaseapp.com",
    projectId: "your-app-id",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
});

const messaging = firebase.messaging();

// Keep track of shown notifications
const shownNotifications = new Set();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message', payload);

    const tag = payload.data?.messageId || 'default-tag';

    // Check if we've already shown this notification
    if (shownNotifications.has(tag)) {
        console.log('Duplicate notification prevented:', tag);
        return;
    }

    const notificationTitle = payload.notification?.title || 'New Notification';
    const notificationOptions = {
        body: payload.notification?.body,
        icon: payload.notification?.icon || '/default-icon.png',
        tag, // Use the tag from the message
        data: {
            url: '#' + (payload.data?.url || '/home'),
            fromUserId: payload.data?.fromUserId || null // Include fromUserId if available
        },
        renotify: false
    };
    shownNotifications.add(tag);

    // Clear the tag from tracking after some time
    setTimeout(() => {
        shownNotifications.delete(tag);
    }, 5000); // Clear after 5 seconds

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification click received:', event);

    event.notification.close();

    // Get the URL and userId from the notification data
    const baseUrl = event.notification.data?.url || '/home';
    const fromUserId = event.notification.data?.fromUserId;
    
    // Construct the target URL with hash routing and query parameter
    const targetPath = '#' + baseUrl;
    const targetUrl = new URL(targetPath, self.location.origin).href;

    // Focus or open the target URL
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Try to find an existing window/tab
            for (const client of clientList) {
                const clientUrl = new URL(client.url);
                // Check if we're on the chat application page
                if (clientUrl.origin === self.location.origin) {
                    return client.focus().then(client => {
                        // Post a message to the client to open the specific chat
                        return client.postMessage({
                            type: 'OPEN_CHAT',
                            userId: fromUserId
                        });
                    });
                }
            }
            // Only open new window if no matching tab is found
            return clients.openWindow(targetUrl);
        })
    );
});