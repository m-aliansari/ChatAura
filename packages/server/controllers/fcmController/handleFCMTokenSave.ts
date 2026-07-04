import { ADD_FCM_TOKEN } from "../../queries/fcm.js";
import { storeFcmToken } from "../../utils/fcm.js";
import { getJwtTokenFromRequest, jwtVerifyPromise } from "../../utils/jwt.js";
import type { Request, Response } from "express";

export const handleFCMTokenSave = async (req: Request, res: Response) => {
    const { fcmToken } = req.body;
    const token = getJwtTokenFromRequest(req);
    const [err, decoded] = await jwtVerifyPromise(token);

    if (err || !decoded) {
        console.log("JWT verification failed or decoded is null");
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (!token || !fcmToken) {
        console.log(`Missing token or FCM token: ${token}, ${fcmToken}`);
        return res.status(400).json({ error: "Missing token or FCM token" });
    }

    try {
        await storeFcmToken(decoded.user_id, fcmToken);

        return res.status(200).json({ message: "FCM token saved successfully" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to save FCM token" });
    }
};
