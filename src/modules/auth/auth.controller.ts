import { Request, Response } from "express";
import { SignupRequest, LoginRequest, AcceptInviteRequest } from "./validation/validation";
import { signup, login, acceptInvite } from "./auth.service";
import { COOKIE_OPTIONS } from "./middleware/auth.middleware";
import { isAppError } from "../../utils/error/error";

/**
 * POST /auth/signup
 * Creates a new user and organization
 * Request body is validated by middleware
 */
export async function signupController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Request body is already validated by zod-express-middleware
    const validatedData = req.body as SignupRequest;

    // Create user and organization
    const result = await signup(validatedData);

    // Set secure HTTP-only cookie
    res.cookie("sessiontoken", result.token, COOKIE_OPTIONS);

    // Send success response (without token in body for security)
    res.status(201).json({
      success: true,
      message: "User and organization created successfully",
      data: {
        user: result.user,
        organization: result.organization,
      },
    });
  } catch (error) {
    console.error("Signup controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * POST /auth/login
 * Authenticates a user and returns a JWT token
 * Request body is validated by middleware
 */
export async function loginController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Request body is already validated by zod-express-middleware
    const validatedData = req.body as LoginRequest;

    // Authenticate user
    const result = await login(validatedData);

    // Set secure HTTP-only cookie
    res.cookie("sessiontoken", result.token, COOKIE_OPTIONS);

    // Send success response (without token in body for security)
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: result.user,
      },
    });
  } catch (error) {
    console.error("Login controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * GET /auth/me
 * Returns current user information from JWT token
 * Requires authentication middleware
 */
export async function meController(req: Request, res: Response): Promise<void> {
  try {
    // User information is populated by authentication middleware
    const user = req.user!; // Non-null assertion since auth middleware validates this

    res.status(200).json({
      success: true,
      data: {
        user: {
          userId: user.userId,
          email: user.email,
          role: user.role,
          orgId: user.orgId,
        },
      },
    });
  } catch (error) {
    console.error("Me controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * POST /auth/logout
 * Clears the authentication cookie
 */
export async function logoutController(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    // Clear the authentication cookie
    res.clearCookie("sessiontoken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * POST /auth/accept-invite
 * Accepts an employee invitation and activates their account
 * Request body is validated by middleware
 */
export async function acceptInviteController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Request body is already validated by zod-express-middleware
    const validatedData = req.body as AcceptInviteRequest;

    // Accept invitation
    const result = await acceptInvite(validatedData);

    // Set secure HTTP-only cookie
    res.cookie("sessiontoken", result.token, COOKIE_OPTIONS);

    // Send success response (without token in body for security)
    res.status(200).json({
      success: true,
      message: "Invitation accepted successfully",
      data: {
        user: result.user,
      },
    });
  } catch (error) {
    console.error("Accept invite controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}
