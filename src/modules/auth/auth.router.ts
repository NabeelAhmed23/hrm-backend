import { Router } from "express";
import {
  signupController,
  loginController,
  meController,
  logoutController,
} from "./auth.controller";
import {
  authenticateToken,
  validateLogin,
  validateSignup,
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

export default authRouter;
