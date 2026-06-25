import { Router } from 'express'
import { rateLimiter } from "../middlewares/express/rateLimiter.js"
import { API_ROUTES } from '@realtime-chatapp/common';
import { handleFCMTokenSave } from '../controllers/fcmController/handleFCMTokenSave.js';
import { handleFCMTokenDelete } from '../controllers/fcmController/handleFCMTokenDelete.js';
const router = Router()

router
    .post(API_ROUTES.FCM.SPECIFIC.TOKEN.SAVE, rateLimiter(60, 10), handleFCMTokenSave);

router
    .post(API_ROUTES.FCM.SPECIFIC.TOKEN.DELETE, rateLimiter(60, 10), handleFCMTokenDelete);

export default router