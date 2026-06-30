import admin from "firebase-admin";
import { createRequire } from "module";

let firebaseAdmin;

if (process.env.DISABLE_FCM === "true") {
    // Test/CI seam: skip reading the gitignored service-account.json and never
    // contact FCM. Production behaviour is unchanged when DISABLE_FCM is unset.
    firebaseAdmin = { messaging: () => ({ send: async () => null }) };
} else {
    const require = createRequire(import.meta.url);
    const serviceAccount = require("./service-account.json");

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
    firebaseAdmin = admin;
}

export default firebaseAdmin;
