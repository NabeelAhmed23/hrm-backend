/**
 * Custom error classes for handling different types of application errors
 * These provide structured error information including status codes and user-friendly messages
 */

export interface ErrorDetails {
  code?: string;
  statusCode: number;
  message: string;
  details?: any;
}

/**
 * Base application error class
 * All custom errors should extend this class
 */
export abstract class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: any;
  public readonly isOperational: boolean = true;

  constructor(message: string, statusCode: number, code?: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON format for API responses
   */
  public toJSON(): ErrorDetails {
    return {
      code: this.code,
      statusCode: this.statusCode,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Validation error - 400 Bad Request
 * Used when input validation fails
 */
export class ValidationError extends AppError {
  constructor(message: string = "Validation failed", details?: any) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

/**
 * Authentication error - 401 Unauthorized
 * Used when authentication fails
 */
export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication failed") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

/**
 * Authorization error - 403 Forbidden
 * Used when user lacks permission for the requested action
 */
export class AuthorizationError extends AppError {
  constructor(message: string = "Insufficient permissions") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

/**
 * Not found error - 404 Not Found
 * Used when a requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND_ERROR");
  }
}

/**
 * Conflict error - 409 Conflict
 * Used when there's a conflict with the current state (e.g., duplicate email)
 */
export class ConflictError extends AppError {
  constructor(message: string = "Resource already exists") {
    super(message, 409, "CONFLICT_ERROR");
  }
}

/**
 * Rate limit error - 429 Too Many Requests
 * Used when rate limiting is enforced
 */
export class RateLimitError extends AppError {
  constructor(message: string = "Too many requests") {
    super(message, 429, "RATE_LIMIT_ERROR");
  }
}

/**
 * Internal server error - 500 Internal Server Error
 * Used for unexpected server errors
 */
export class InternalServerError extends AppError {
  constructor(message: string = "Internal server error", details?: any) {
    super(message, 500, "INTERNAL_SERVER_ERROR", details);
  }
}

/**
 * Database error - 500 Internal Server Error
 * Used specifically for database-related errors
 */
export class DatabaseError extends AppError {
  constructor(message: string = "Database operation failed", details?: any) {
    super(message, 500, "DATABASE_ERROR", details);
  }
}

/**
 * Token error - 401 Unauthorized
 * Used for JWT token-related errors
 */
export class TokenError extends AppError {
  constructor(message: string = "Invalid or expired token") {
    super(message, 401, "TOKEN_ERROR");
  }
}

/**
 * Account deactivated error - 403 Forbidden
 * Used when user account is deactivated
 */
export class AccountDeactivatedError extends AppError {
  constructor(message: string = "Account is deactivated") {
    super(message, 403, "ACCOUNT_DEACTIVATED_ERROR");
  }
}

/**
 * Utility function to check if an error is an operational error
 * Operational errors are expected errors that we can handle gracefully
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Utility function to handle Prisma errors and convert them to appropriate AppErrors
 */
export function handlePrismaError(error: any): AppError {
  if (error.code) {
    switch (error.code) {
      case "P2002": // Unique constraint violation
        return new ConflictError("A record with this information already exists");
      case "P2025": // Record not found
        return new NotFoundError("Record");
      case "P2003": // Foreign key constraint violation
        return new ValidationError("Invalid reference to related record");
      case "P2014": // Invalid ID
        return new ValidationError("Invalid ID provided");
      default:
        return new DatabaseError("Database operation failed", { code: error.code });
    }
  }
  return new DatabaseError("Unknown database error", error);
}

/**
 * Type guard to check if error is an AppError
 */
export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}