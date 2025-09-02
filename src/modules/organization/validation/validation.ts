import { z } from 'zod';

/**
 * Validation schema for updating organization details
 * All fields are optional to allow partial updates
 */
export const updateOrganizationSchema = z.object({
  name: z
    .string()
    .min(1, 'Organization name cannot be empty')
    .max(100, 'Organization name cannot exceed 100 characters')
    .optional(),
  industry: z
    .string()
    .min(1, 'Industry cannot be empty')
    .max(50, 'Industry cannot exceed 50 characters')
    .optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  {
    message: "At least one field must be provided for update",
  }
);

/**
 * Validation schema for organization ID parameter
 */
export const organizationIdSchema = z.object({
  id: z
    .string()
    .uuid('Organization ID must be a valid UUID')
});

// Type inference from schemas
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationSchema>;
export type OrganizationIdParams = z.infer<typeof organizationIdSchema>;