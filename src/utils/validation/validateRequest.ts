import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Schema configuration for request validation
 * Can validate body, query, and params independently
 */
export interface RequestSchema {
  body?: z.ZodSchema<any>;
  query?: z.ZodSchema<any>;
  params?: z.ZodSchema<any>;
}

/**
 * Validated request data structure
 * Contains parsed and validated data from request
 */
export interface ValidatedRequestData {
  body?: any;
  query?: any;
  params?: any;
}

/**
 * Extended Express Request interface with validated data
 * Provides type-safe access to validated request data
 */
declare global {
  namespace Express {
    interface Request {
      validated: ValidatedRequestData;
    }
  }
}

/**
 * Validation error response structure
 * Provides detailed error information for client debugging
 */
interface ValidationErrorResponse {
  error: string;
  details: {
    body?: Record<string, string[]>;
    query?: Record<string, string[]>;
    params?: Record<string, string[]>;
    _general?: string[];
  };
}

/**
 * Transform Zod validation errors into readable format
 * Converts Zod error structure into client-friendly error messages
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const formattedErrors: Record<string, string[]> = {};

  error.issues.forEach((err) => {
    const path = err.path.join('.');
    const message = err.message;

    if (!formattedErrors[path]) {
      formattedErrors[path] = [];
    }
    formattedErrors[path].push(message);
  });

  return formattedErrors;
}

/**
 * Custom validation middleware factory
 * Creates Express middleware for validating requests using Zod schemas
 * 
 * Features:
 * - Validates req.body, req.query, and req.params independently
 * - Provides full TypeScript type inference
 * - Returns standardized error responses
 * - Attaches parsed data to req.validated for type-safe access
 * 
 * @param schema - Object containing optional Zod schemas for body, query, params
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * const userSchema = {
 *   body: z.object({
 *     name: z.string(),
 *     age: z.number().int().positive(),
 *   }),
 *   query: z.object({
 *     page: z.string().transform(Number).pipe(z.number().int().positive())
 *   })
 * };
 * 
 * app.post("/users", validateRequest(userSchema), (req, res) => {
 *   // req.validated.body is fully typed and validated
 *   res.json({ user: req.validated.body });
 * });
 * ```
 */
export function validateRequest(schema: RequestSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationErrorResponse['details'] = {};
    const validated: ValidatedRequestData = {};

    try {
      // Validate request body
      if (schema.body) {
        try {
          validated.body = schema.body.parse(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.body = formatZodErrors(error);
          } else {
            errors.body = { _general: ['Invalid request body format'] };
          }
        }
      }

      // Validate query parameters
      if (schema.query) {
        try {
          validated.query = schema.query.parse(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.query = formatZodErrors(error);
          } else {
            errors.query = { _general: ['Invalid query parameters format'] };
          }
        }
      }

      // Validate route parameters
      if (schema.params) {
        try {
          validated.params = schema.params.parse(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.params = formatZodErrors(error);
          } else {
            errors.params = { _general: ['Invalid route parameters format'] };
          }
        }
      }

      // Check if any validation errors occurred
      if (Object.keys(errors).length > 0) {
        const errorResponse: ValidationErrorResponse = {
          error: 'Validation failed',
          details: errors,
        };

        res.status(400).json(errorResponse);
        return;
      }

      // Attach validated data to request for type-safe access
      req.validated = validated;
      next();

    } catch (error) {
      // Handle unexpected validation errors
      console.error('Validation middleware error:', error);
      
      const errorResponse: ValidationErrorResponse = {
        error: 'Internal validation error',
        details: {
          _general: ['An unexpected error occurred during validation'],
        },
      };

      res.status(500).json(errorResponse);
    }
  };
}

/**
 * Utility type for extracting validated request data types
 * Provides TypeScript type inference for validated data
 */
export type InferValidatedData<T extends RequestSchema> = {
  body: T['body'] extends z.ZodSchema<infer B> ? B : undefined;
  query: T['query'] extends z.ZodSchema<infer Q> ? Q : undefined;
  params: T['params'] extends z.ZodSchema<infer P> ? P : undefined;
};

/**
 * Type-safe request handler with validated data
 * Extends Express RequestHandler with typed validated data
 */
export type ValidatedRequestHandler<T extends RequestSchema> = (
  req: Request & { validated: InferValidatedData<T> },
  res: Response,
  next: NextFunction
) => void | Promise<void>;

/**
 * Example usage and test schemas
 * Demonstrates how to use the validation middleware
 */
export const exampleSchemas = {
  // User creation schema
  createUser: {
    body: z.object({
      name: z.string().min(1, 'Name is required'),
      email: z.string().email('Invalid email format'),
      age: z.number().int().positive('Age must be a positive integer'),
    }),
    query: z.object({
      sendWelcomeEmail: z
        .string()
        .optional()
        .transform((val) => val === 'true'),
    }),
  },

  // User update schema
  updateUser: {
    params: z.object({
      id: z.string().uuid('Invalid user ID format'),
    }),
    body: z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      age: z.number().int().positive().optional(),
    }),
  },

  // Pagination schema
  pagination: {
    query: z.object({
      page: z
        .string()
        .default('1')
        .transform(Number)
        .pipe(z.number().int().positive()),
      limit: z
        .string()
        .default('10')
        .transform(Number)
        .pipe(z.number().int().positive().max(100)),
      search: z.string().optional(),
    }),
  },
} as const;