import bcrypt from "bcrypt";
import crypto from "crypto";
import { Organization, Role } from "../../../generated/prisma";
import {
  SignupRequest,
  LoginRequest,
  AcceptInviteRequest,
} from "./validation/validation";
import { signJWT, JWTPayload } from "../../utils/jwt/jwt.utils";
import prisma from "../../utils/config/db";
import { emailService } from "../../services/emailService";
import {
  ConflictError,
  AuthenticationError,
  AccountDeactivatedError,
  InternalServerError,
  NotFoundError,
  ValidationError,
  handlePrismaError,
} from "../../utils/error/error";

// Salt rounds for bcrypt password hashing
const BCRYPT_SALT_ROUNDS = 12;

// Password reset token expiration (1 hour in milliseconds)
const PASSWORD_RESET_EXPIRY = 60 * 60 * 1000;

// Response interfaces
export interface SignupResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  organization: {
    id: string;
    name: string;
  };
  token: string; // For cookie setting
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organization: Organization;
  };
  token: string; // For cookie setting
}

export interface AcceptInviteResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organization: Organization;
  };
  token: string; // For cookie setting
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

export interface GetCurrentUserResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string | null;
    role: string;
    isActive: boolean;
    createdAt: Date;
  };
  organization: {
    id: string;
    name: string;
    industry: string | null;
    createdAt: Date;
  };
}

/**
 * Creates a new user and organization in a single transaction
 * The first user in an organization is automatically assigned ADMIN role
 */
export async function signup(data: SignupRequest): Promise<SignupResponse> {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError("User with this email already exists");
    }

    // Hash the password securely
    const hashedPassword = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);

    // Create organization and user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the organization first
      const organization = await tx.organization.create({
        data: {
          name: data.organizationName,
        },
      });

      // Create the user as ADMIN of the organization
      const user = await tx.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          role: Role.ADMIN, // First user is always admin
          organizationId: organization.id,
        },
      });

      return { user, organization };
    });

    // Prepare JWT payload
    const jwtPayload: JWTPayload = {
      userId: result.user.id,
      orgId: result.organization.id,
      email: result.user.email,
      role: result.user.role,
      firstName: result.user.firstName,
      lastName: result.user.lastName || undefined,
    };

    // Sign JWT token
    const token = signJWT(jwtPayload);

    // Return response without sensitive data
    return {
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName || "",
        role: result.user.role,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
      },
    };
  } catch (error) {
    console.error("Signup error:", error);

    // Re-throw custom errors as they are
    if (error instanceof ConflictError) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle bcrypt errors
    if (error instanceof Error && error.message.includes("bcrypt")) {
      throw new InternalServerError("Password hashing failed");
    }

    // Handle unexpected errors
    throw new InternalServerError("An unexpected error occurred during signup");
  }
}

/**
 * Authenticates a user and returns a JWT token
 */
export async function login(data: LoginRequest): Promise<LoginResponse> {
  try {
    // Find user with organization data
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        organization: true,
      },
    });

    if (!user) {
      throw new AuthenticationError("Invalid email or password");
    }

    if (!user.isActive) {
      throw new AccountDeactivatedError("Account is deactivated");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      throw new AuthenticationError("Invalid email or password");
    }

    // Prepare JWT payload
    const jwtPayload: JWTPayload = {
      userId: user.id,
      orgId: user.organizationId,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName || undefined,
    };

    // Sign JWT token
    const token = signJWT(jwtPayload);

    // Return response
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName || "",
        role: user.role,
        organization: user.organization,
      },
    };
  } catch (error) {
    console.error("Login error:", error);

    // Re-throw custom errors as they are
    if (
      error instanceof AuthenticationError ||
      error instanceof AccountDeactivatedError
    ) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle bcrypt errors
    if (error instanceof Error && error.message.includes("bcrypt")) {
      throw new InternalServerError("Password verification failed");
    }

    // Handle unexpected errors
    throw new InternalServerError("An unexpected error occurred during login");
  }
}

/**
 * Accepts an employee invitation and activates their account
 * Allows the invited employee to set their password and activate their account
 */
export async function acceptInvite(
  data: AcceptInviteRequest
): Promise<AcceptInviteResponse> {
  try {
    // For now, we'll simulate token validation
    // In production, you'd store invite tokens in a separate table with expiration
    const { password } = data;

    // Find user by email (temporary approach - in production, store tokens properly)
    // For this demo, we'll assume the token contains encoded user information
    // In reality, you'd have an InviteToken table that maps tokens to users

    // This is a simplified implementation - in production you'd:
    // 1. Store invite tokens in database with expiration
    // 2. Validate token exists and hasn't expired
    // 3. Get user ID from token record

    // For now, find any inactive user (recently invited)
    const user = await prisma.user.findFirst({
      where: {
        isActive: false,
        // You could add additional filters like created recently, etc.
      },
      include: {
        organization: true,
      },
    });

    if (!user) {
      throw new AuthenticationError("Invalid or expired invitation token");
    }

    if (user.isActive) {
      throw new ConflictError("Invitation has already been accepted");
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Update user with new password and activate account
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        isActive: true,
        updatedAt: new Date(),
      },
      include: {
        organization: true,
      },
    });

    // Prepare JWT payload
    const jwtPayload: JWTPayload = {
      userId: updatedUser.id,
      orgId: updatedUser.organizationId,
      email: updatedUser.email,
      role: updatedUser.role,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName || undefined,
    };

    // Sign JWT token
    const jwtToken = signJWT(jwtPayload);

    // Return response
    return {
      token: jwtToken,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName || "",
        role: updatedUser.role,
        organization: updatedUser.organization,
      },
    };
  } catch (error) {
    console.error("Accept invite error:", error);

    // Re-throw custom errors
    if (
      error instanceof AuthenticationError ||
      error instanceof ConflictError
    ) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle bcrypt errors
    if (error instanceof Error && error.message.includes("bcrypt")) {
      throw new InternalServerError("Password hashing failed");
    }

    // Handle unexpected errors
    throw new InternalServerError(
      "An unexpected error occurred while accepting invitation"
    );
  }
}

/**
 * Generates a secure password reset token for a user
 * Always returns success to prevent email enumeration attacks
 * Sends email with reset link if user exists
 */
export async function requestPasswordReset(
  email: string
): Promise<ForgotPasswordResponse> {
  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Always return success response to prevent email enumeration
    if (!user || !user.isActive) {
      return {
        success: true,
        message:
          "If an account with this email exists, you will receive a password reset link.",
      };
    }

    // Generate secure random token (32 bytes = 64 hex characters)
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Calculate expiry time (1 hour from now)
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY);

    // Create password reset token in database (transaction for consistency)
    await prisma.$transaction(async (tx) => {
      // Invalidate any existing reset tokens for this user
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          used: false,
          expiresAt: { gte: new Date() }, // Only update non-expired tokens
        },
        data: {
          used: true, // Mark as used to invalidate
        },
      });

      // Create new reset token
      await tx.passwordResetToken.create({
        data: {
          token: resetToken,
          userId: user.id,
          expiresAt,
        },
      });
    });

    // Construct reset link using environment variable
    const resetUrl = `${
      process.env.APP_URL ? process.env.APP_URL : "http://localhost:3000"
    }/reset-password/`;
    const resetLink = `${resetUrl}token/${resetToken}`;

    // Send password reset email
    await emailService.sendPasswordReset(user.email, resetLink, {
      firstName: user.firstName,
      resetLink,
    });

    return {
      success: true,
      message:
        "If an account with this email exists, you will receive a password reset link.",
    };
  } catch (error) {
    console.error("Password reset request error:", error);

    // Always return success to prevent information leakage
    // Log the actual error for debugging but don't expose to client
    return {
      success: true,
      message:
        "If an account with this email exists, you will receive a password reset link.",
    };
  }
}

/**
 * Validates reset token and updates user password
 * Implements single-use tokens and expiry validation
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<ResetPasswordResponse> {
  try {
    // Find valid, unused, non-expired reset token
    const resetTokenRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetTokenRecord) {
      throw new ValidationError("Invalid or expired reset token");
    }

    if (resetTokenRecord.used) {
      throw new ValidationError("Reset token has already been used");
    }

    if (resetTokenRecord.expiresAt < new Date()) {
      throw new ValidationError("Reset token has expired");
    }

    if (!resetTokenRecord.user.isActive) {
      throw new ValidationError("Account is deactivated");
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    // Update password and invalidate token in transaction
    await prisma.$transaction(async (tx) => {
      // Update user password
      await tx.user.update({
        where: { id: resetTokenRecord.userId },
        data: {
          password: hashedPassword,
          updatedAt: new Date(),
        },
      });

      // Mark reset token as used
      await tx.passwordResetToken.update({
        where: { id: resetTokenRecord.id },
        data: {
          used: true,
        },
      });
    });

    return {
      success: true,
      message:
        "Password has been reset successfully. You can now log in with your new password.",
    };
  } catch (error) {
    console.error("Password reset error:", error);

    // Re-throw validation errors (these are safe to expose)
    if (error instanceof ValidationError) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle bcrypt errors
    if (error instanceof Error && error.message.includes("bcrypt")) {
      throw new InternalServerError("Password hashing failed");
    }

    // Handle unexpected errors
    throw new InternalServerError(
      "An unexpected error occurred while resetting password"
    );
  }
}

/**
 * Gets current user information and organization from database
 * Returns complete user profile and organization data
 */
export async function getCurrentUser(userId: string): Promise<GetCurrentUserResponse> {
  try {
    // Fetch full user and organization data from database
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            industry: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      organization: user.organization,
    };
  } catch (error) {
    console.error("Get current user error:", error);

    // Re-throw custom errors
    if (error instanceof NotFoundError) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle unexpected errors
    throw new InternalServerError(
      "An unexpected error occurred while fetching user data"
    );
  }
}
