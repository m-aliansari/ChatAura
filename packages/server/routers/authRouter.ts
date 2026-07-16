import { Router } from "express";
import validateForm from "../middlewares/express/validateForm.js";
import { rateLimiter } from "../middlewares/express/rateLimiter.js";
import { handleCheckLogin } from "../controllers/authController/handleCheckLogin.js";
import { handleLogin } from "../controllers/authController/handleLogin.js";
import { handleRegister } from "../controllers/authController/handleRegister.js";
import { API_ROUTES, registerFormSchema } from "@realtime-chatapp/common";
const router = Router();

router
    .route(API_ROUTES.AUTH.SPECIFIC.LOGIN)
    .get(handleCheckLogin)
    .post(rateLimiter(60, 10), validateForm(), handleLogin);

router.post(
    API_ROUTES.AUTH.SPECIFIC.REGISTER,
    rateLimiter(60, 5),
    validateForm(registerFormSchema),
    handleRegister,
);

export default router;
