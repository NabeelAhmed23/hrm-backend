import { Router } from "express";
import {
  signupController,
  loginController,
  meController,
  logoutController,
  acceptInviteController,
  forgotPasswordController,
  resetPasswordController,
} from "./auth.controller";
import {
  authenticateToken,
  validateLogin,
  validateSignup,
  validateAcceptInvite,
  validateForgotPassword,
  validateResetPassword,
} from "./middleware/auth.middleware";

const authRouter = Router();

// POST /auth/signup - Create new user and organization
authRouter.post("/signup", validateSignup, signupController);

// POST /auth/login - Authenticate user
authRouter.post("/login", validateLogin, loginController);

// GET /auth/me - Get current user info (requires authentication)
authRouter.get("/me", authenticateToken, meController);

// POST /auth/logout - Clear authentication cookie
authRouter.post("/logout", logoutController);

// POST /auth/accept-invite - Accept employee invitation and activate account
authRouter.post("/accept-invite", validateAcceptInvite, acceptInviteController);

// POST /auth/forgot-password - Request password reset (always returns success)
authRouter.post("/forgot-password", validateForgotPassword, forgotPasswordController);

// POST /auth/reset-password - Reset password with token
authRouter.post("/reset-password", validateResetPassword, resetPasswordController);

export default authRouter;
