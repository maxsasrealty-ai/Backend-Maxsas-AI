import { Router } from "express";

import {
  logoutController,
  meController,
  refreshController,
  sendOtpController,
  verifyMagicController,
  verifyOtpController,
  loginController,
  googleController,
  sendSignupOtpController,
  verifySignupOtpController,
  sendPasswordResetOtpController,
  verifyPasswordResetOtpController,
} from "./auth.controller";

const authRouter = Router();

authRouter.post("/login", loginController);
authRouter.post("/google", googleController);
authRouter.post("/signup/send-otp", sendSignupOtpController);
authRouter.post("/signup/verify", verifySignupOtpController);
authRouter.post("/password/forgot", sendPasswordResetOtpController);
authRouter.post("/password/reset", verifyPasswordResetOtpController);
authRouter.post("/send-otp", sendOtpController);
authRouter.post("/verify-otp", verifyOtpController);
authRouter.post("/magic/verify", verifyMagicController);
authRouter.get("/magic/verify", verifyMagicController);
authRouter.post("/refresh", refreshController);
authRouter.post("/logout", logoutController);
authRouter.get("/me", meController);

export default authRouter;
