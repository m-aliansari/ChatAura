# Push Notification — Manual Smoke Test (Layer D)

Automated tests cover everything up to Google's boundary (token storage, the
decision to send + payload shape, and the service-worker display/click logic —
see Layers A–C in the test suite). The one leg that **cannot** be automated is
the real delivery: our server → Google FCM cloud → the browser's push service →
the OS notification. Verify that leg by hand before a release.

## Prerequisites

- Server running with a valid `packages/server/service-account.json` and the
  Firebase project configured.
- Client built/served with real `VITE_FIREBASE_VAPID_KEY` and the real Firebase
  web config filled into `packages/client/public/firebase-messaging-sw.js`
  (the committed file ships with `YOUR_API_KEY` placeholders — notifications
  silently never arrive if these are not replaced at deploy time).
- Two registered users who are friends (e.g. `alice` and `bob`).
- A browser that supports web push (Chrome/Edge), notifications **allowed** for
  the site at the OS level.

## Steps

1. Log in as `bob` in one browser profile. When prompted, **allow** notifications.
   Confirm the FCM token was saved (network: `POST /fcm/token/save` returns ok).
2. Background bob's tab (switch to another window/app — background messages only
   fire when the page is not focused).
3. In a second browser profile, log in as `alice` and send `bob` a message.
4. **Expect:** within a few seconds an OS notification appears titled
   "New Message" with alice's message text as the body.
5. Click the notification.
6. **Expect:** bob's window focuses (or opens) and deep-links into the
   conversation with alice (`#/home?userId=<alice>`), via the `OPEN_CHAT`
   postMessage / `openWindow` path.

## Known gaps to watch for (documented by the automated tests)

- **Multi-device:** `sendChatNotifications` only sends to `fcmTokens[0]`, so a
  user logged in on several devices is notified on **one** of them. If you test
  with two devices for the same user, only one will buzz — that is current
  behavior, not a new bug.
- **Silent failures:** `sendChatNotifications` swallows errors in a try/catch and
  only `console.error`s. If no notification arrives, check the **server logs**
  for "Error sending notifications" — the client side shows nothing.

## Result

Record pass/fail + date here when run:

| Date | Tester | Result | Notes |
|------|--------|--------|-------|
|      |        |        |       |
