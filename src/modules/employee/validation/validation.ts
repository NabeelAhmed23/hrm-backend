import { z } from 'zod';

/**
 * Validation schema for creating a new employee
 */
export const createEmployeeSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters')
    .trim(),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters')
    .trim(),
  email: z
    .string()
    .email('Invalid email address')
    .min(1, 'Email is required')
    .max(255, 'Email cannot exceed 255 characters')
    .trim(),
  dob: z
    .string()
    .or(z.date())
    .transform((val) => new Date(val))
    .refine((date) => !isNaN(date.getTime()), 'Invalid date format')
    .refine((date) => date < new Date(), 'Date of birth cannot be in the future')
    .refine(
      (date) => {
        const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        return age >= 16 && age <= 100;
      },
      'Employee must be between 16 and 100 years old'
    ),
  address: z
    .string()
    .min(1, 'Address is required')
    .max(200, 'Address cannot exceed 200 characters')
    .trim(),
  city: z
    .string()
    .min(1, 'City is required')
    .max(50, 'City cannot exceed 50 characters')
    .trim(),
  state: z
    .string()
    .min(1, 'State is required')
    .max(50, 'State cannot exceed 50 characters')
    .trim(),
  country: z
    .string()
    .min(1, 'Country is required')
    .max(50, 'Country cannot exceed 50 characters')
    .trim(),
});

/**
 * Validation schema for updating employee details
 * All fields are optional to allow partial updates
 */
export const updateEmployeeSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name cannot be empty')
    .max(50, 'First name cannot exceed 50 characters')
    .trim()
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name cannot be empty')
    .max(50, 'Last name cannot exceed 50 characters')
    .trim()
    .optional(),
  email: z
    .string()
    .email('Invalid email address')
    .min(1, 'Email cannot be empty')
    .max(255, 'Email cannot exceed 255 characters')
    .trim()
    .optional(),
  dob: z
    .string()
    .or(z.date())
    .transform((val) => new Date(val))
    .refine((date) => !isNaN(date.getTime()), 'Invalid date format')
    .refine((date) => date < new Date(), 'Date of birth cannot be in the future')
    .refine(
      (date) => {
        const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        return age >= 16 && age <= 100;
      },
      'Employee must be between 16 and 100 years old'
    )
    .optional(),
  address: z
    .string()
    .min(1, 'Address cannot be empty')
    .max(200, 'Address cannot exceed 200 characters')
    .trim()
    .optional(),
  city: z
    .string()
    .min(1, 'City cannot be empty')
    .max(50, 'City cannot exceed 50 characters')
    .trim()
    .optional(),
  state: z
    .string()
    .min(1, 'State cannot be empty')
    .max(50, 'State cannot exceed 50 characters')
    .trim()
    .optional(),
  country: z
    .string()
    .min(1, 'Country cannot be empty')
    .max(50, 'Country cannot exceed 50 characters')
    .trim()
    .optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  {
    message: "At least one field must be provided for update",
  }
);

/**
 * Validation schema for employee ID parameter
 */
export const employeeIdSchema = z.object({
  id: z
    .string()
    .uuid('Employee ID must be a valid UUID')
});

/**
 * Validation schema for employee invite
 */
export const inviteEmployeeSchema = z.object({
  sendEmail: z
    .boolean()
    .default(true)
    .optional(),
});

/**
 * Validation schema for query parameters in GET /employees
 */
export const getEmployeesQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 1)
    .refine((val) => val > 0, 'Page must be greater than 0'),
  limit: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 10)
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
  search: z
    .string()
    .max(100, 'Search query cannot exceed 100 characters')
    .optional(),
  includeDeleted: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default(false),
});

/**
 * Validation schema for accept invite request
 */
export const acceptInviteSchema = z.object({
  token: z
    .string()
    .min(1, 'Invite token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),
  confirmPassword: z
    .string()
    .min(1, 'Password confirmation is required'),
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  }
);

// Type inference from schemas
export type CreateEmployeeRequest = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeSchema>;
export type EmployeeIdParams = z.infer<typeof employeeIdSchema>;
export type InviteEmployeeRequest = z.infer<typeof inviteEmployeeSchema>;
export type GetEmployeesQuery = z.infer<typeof getEmployeesQuerySchema>;
export type AcceptInviteRequest = z.infer<typeof acceptInviteSchema>;