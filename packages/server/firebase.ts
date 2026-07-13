import admin from "firebase-admin";
import type { ServiceAccount } from "firebase-admin";

/**
 * The service account comes from the environment, never from a file on disk: a credential in
 * the working tree is one `git add -f` away from being published, and a container image must
 * not carry one in a layer. Every environment injects FIREBASE_SERVICE_ACCOUNT_JSON from a
 * secret store instead (Render env var, ECS Secrets Manager, k8s Secret, …).
 *
 * Accepts raw JSON or base64. A service account's private key is multi-line, which `.env`
 * files and many secret UIs mangle; base64 collapses it to one safe line.
 */
function loadServiceAccount(): ServiceAccount {
    const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!fromEnv) {
        throw new Error(
            "FIREBASE_SERVICE_ACCOUNT_JSON is not set. Provide the Firebase service account " +
                "(raw JSON or base64), or set DISABLE_FCM=true to run without push notifications.",
        );
    }

    const json = fromEnv.trimStart().startsWith("{")
        ? fromEnv
        : Buffer.from(fromEnv, "base64").toString("utf8");

    return JSON.parse(json) as ServiceAccount;
}

let firebaseAdmin: typeof admin;

if (process.env.DISABLE_FCM === "true") {
    // Test/CI seam: skip loading credentials entirely and never contact FCM.
    // Production behaviour is unchanged when DISABLE_FCM is unset.
    firebaseAdmin = {
        messaging: () => ({ send: async () => null }),
    } as unknown as typeof admin;
} else {
    admin.initializeApp({
        credential: admin.credential.cert(loadServiceAccount()),
    });
    firebaseAdmin = admin;
}

export default firebaseAdmin;
