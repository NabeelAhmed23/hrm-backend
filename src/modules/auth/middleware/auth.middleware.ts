import { processRequestBody } from "zod-express-middleware";
import { signupSchema, loginSchema } from "../validation/validation";
import { Request, Response, NextFunction } from "express";
import { JWTPayload, verifyJWT } from "../../../utils/jwt/jwt.utils";

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

// Validation middleware for signup endpoint
export const validateSignup = processRequestBody(signupSchema);

// Validation middleware for login endpoint
export const validateLogin = processRequestBody(loginSchema);

// Cookie configuration
export const COOKIE_OPTIONS = {
  httpOnly: true, // Prevent XSS attacks
  secure: process.env.NODE_ENV === "production", // Use HTTPS in production
  sameSite: "strict" as const, // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  path: "/",
};

/**
 * Authentication middleware that validates JWT tokens from cookies
 * Adds user information to req.user if authentication succeeds
 */
export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Get token from cookies
    const token = req.cookies?.sessiontoken;

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Authentication required - no token provided",
      });
      return;
    }

    // Verify and decode token
    const decoded = verifyJWT(token);

    if (!decoded) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
      return;
    }

    // Add user info to request
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    res.status(401).json({
      success: false,
      message: "Authentication failed",
    });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token
 * Sets req.user if valid token exists, otherwise continues without error
 */
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = req.cookies?.sessiontoken;

    if (token) {
      const decoded = verifyJWT(token);
      if (decoded) {
        req.user = decoded;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication on error
    next();
  }
}

/**
 * Role-based authorization middleware
 * Requires user to be authenticated and have specified role(s)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
      return;
    }

    next();
  };
}

/**
 * Organization-based authorization middleware
 * Requires user to belong to the same organization as the resource
 */
export function requireSameOrg(
  getOrgIdFromRequest: (req: Request) => string | undefined
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const resourceOrgId = getOrgIdFromRequest(req);

    if (!resourceOrgId) {
      res.status(400).json({
        success: false,
        message: "Organization context required",
      });
      return;
    }

    if (req.user.orgId !== resourceOrgId) {
      res.status(403).json({
        success: false,
        message: "Access denied - different organization",
      });
      return;
    }

    next();
  };
}
