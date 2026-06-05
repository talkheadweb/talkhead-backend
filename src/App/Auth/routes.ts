import authenticate from "@/Middlewares/Auth";
import { emailLimiter, loginLimiter } from "@/Middlewares/RateLimit";
import validateRequest from "@/Middlewares/validateRequest";
import { upload } from "@/Utils/file/config";
import { Router } from "express";
import { AuthController } from "./controller";
import { AuthValidation } from "./validation";

const authRouter = Router();

authRouter
  // ── Social login ──────────────────────────────────────────────────────
  // GET /auth/google          → redirect to Google consent screen
  // GET /auth/google/callback → Google redirects here; issues tokens, redirects to frontend
  .get("/google",          AuthController.googleAuth)
  .get("/google/callback", AuthController.googleCallback)
  // ── Public ───────────────────────────────────────────────────────────
  // emailLimiter guards routes that send mail; loginLimiter guards brute-force.
  .post("/register",            emailLimiter, validateRequest(AuthValidation.registerZodSchema),            AuthController.register)
  .post("/login",               loginLimiter, validateRequest(AuthValidation.loginZodSchema),               AuthController.login)
  .post("/logout",                                                                                           AuthController.logout)
  .post("/refresh-token",                                                                                    AuthController.refreshToken)
  .post("/forgot-password",     emailLimiter, validateRequest(AuthValidation.forgotPasswordZodSchema),      AuthController.forgotPassword)
  .post("/reset-password",      validateRequest(AuthValidation.resetPasswordZodSchema),                     AuthController.resetPassword)
  .post("/verify-email",        validateRequest(AuthValidation.verifyEmailZodSchema),                       AuthController.verifyEmail)
  .post("/resend-verification", emailLimiter, validateRequest(AuthValidation.resendVerificationZodSchema),  AuthController.resendVerification)
  // ── Protected ─────────────────────────────────────────────────────────
  .get( "/me",              authenticate,                                                                                          AuthController.getMe)
  .patch("/profile",        authenticate, upload.single("profilePicture"), validateRequest(AuthValidation.updateProfileZodSchema), AuthController.updateProfile)
  .patch("/change-password",authenticate, validateRequest(AuthValidation.changePasswordZodSchema),                                 AuthController.changePassword);

export default authRouter;
