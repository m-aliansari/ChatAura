import admin from "firebase-admin";
import { createRequire } from "module";
import type { ServiceAccount } from "firebase-admin";

/**
 * Credentials come from the environment first so the gitignored service-account.json never
 * has to be baked into a container image layer: a deployment injects
 * FIREBASE_SERVICE_ACCOUNT_JSON from a secret store (ECS Secrets Manager, k8s Secret, …).
 * Accepts raw JSON or base64 — most secret stores and CI UIs mangle multi-line values, and
 * the private key in a service account is multi-line.
 *
 * The on-disk file remains the local-dev path, so `yarn dev:server` is unchanged.
 */
function loadServiceAccount(): ServiceAccount {
    const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (fromEnv) {
        const json = fromEnv.trimStart().startsWith("{")
            ? fromEnv
            : Buffer.from(fromEnv, "base64").toString("utf8");
        return JSON.parse(json) as ServiceAccount;
    }

    const require = createRequire(import.meta.url);
    return require("./service-account.json") as ServiceAccount;
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
