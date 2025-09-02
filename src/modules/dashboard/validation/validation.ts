/**
 * Dashboard Compliance Validation Schemas
 * 
 * Zod schemas for validating compliance dashboard API requests.
 * Includes validation for employee ID parameters and query filters.
 */

import { z } from 'zod';
import { DocumentType } from '../../../../generated/prisma';

/**
 * Schema for employee ID parameter validation
 */
export const employeeIdSchema = z.object({
  employeeId: z
    .string()
    .uuid('Employee ID must be a valid UUID'),
});

/**
 * Schema for compliance dashboard query parameters
 */
export const complianceQuerySchema = z.object({
  status: z
    .enum(['GREEN', 'YELLOW', 'RED'])
    .optional(),
  documentType: z
    .string()
    .optional()
    .refine(
      (val) => !val || Object.values(DocumentType).includes(val as DocumentType),
      'Invalid document type filter'
    )
    .transform((val) => val as DocumentType | undefined),
  includeMetrics: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default(false),
  sortBy: z
    .enum(['name', 'status', 'expiry'])
    .optional()
    .default('name'),
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('asc'),
});

/**
 * Schema for compliance metrics query parameters
 */
export const complianceMetricsQuerySchema = z.object({
  period: z
    .enum(['30', '60', '90'])
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 30),
  includeProjections: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default(false),
});

/**
 * Schema for critical issues query parameters
 */
export const criticalIssuesQuerySchema = z.object({
  maxDaysExpired: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : undefined)
    .refine((val) => !val || val > 0, 'Max days expired must be positive'),
  documentType: z
    .string()
    .optional()
    .refine(
      (val) => !val || Object.values(DocumentType).includes(val as DocumentType),
      'Invalid document type filter'
    )
    .transform((val) => val as DocumentType | undefined),
  sortBy: z
    .enum(['employee', 'expiry', 'type'])
    .optional()
    .default('expiry'),
});

/**
 * Schema for document type compliance query parameters
 */
export const typeComplianceQuerySchema = z.object({
  includeDetails: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default(false),
  minDocuments: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 1)
    .refine((val) => val > 0, 'Minimum documents must be positive'),
});

// Type inference from schemas
export type EmployeeIdParams = z.infer<typeof employeeIdSchema>;
export type ComplianceQuery = z.infer<typeof complianceQuerySchema>;
export type ComplianceMetricsQuery = z.infer<typeof complianceMetricsQuerySchema>;
export type CriticalIssuesQuery = z.infer<typeof criticalIssuesQuerySchema>;
export type TypeComplianceQuery = z.infer<typeof typeComplianceQuerySchema>;

// Response type definitions for API documentation
export interface ComplianceApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ErrorResponse {
  success: false;
  message: string;
  code?: string;
  details?: any;
}

// Standard API response schemas for validation
export const successResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.any(),
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  code: z.string().optional(),
  details: z.any().optional(),
});

export const complianceStatusSchema = z.enum(['GREEN', 'YELLOW', 'RED']);

export const complianceSummarySchema = z.object({
  green: z.number().min(0),
  yellow: z.number().min(0),
  red: z.number().min(0),
  total: z.number().min(0),
});

export const employeeComplianceSchema = z.object({
  employeeId: z.string().uuid(),
  name: z.string(),
  status: complianceStatusSchema,
});

export const documentComplianceSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string(),
  status: complianceStatusSchema,
  expiresAt: z.date().optional(),
  daysUntilExpiry: z.number().optional(),
});

export const organizationComplianceSchema = z.object({
  organizationId: z.string().uuid(),
  summary: complianceSummarySchema,
  employees: z.array(employeeComplianceSchema),
});

export const employeeDetailComplianceSchema = z.object({
  employeeId: z.string().uuid(),
  name: z.string(),
  status: complianceStatusSchema,
  documents: z.array(documentComplianceSchema),
});

export const typeComplianceSchema = z.object({
  documentType: z.string(),
  summary: complianceSummarySchema,
  documents: z.array(documentComplianceSchema),
});

export const complianceMetricsSchema = z.object({
  totalEmployees: z.number().min(0),
  totalDocuments: z.number().min(0),
  complianceSummary: z.object({
    green: z.number().min(0),
    yellow: z.number().min(0),
    red: z.number().min(0),
  }),
  documentsExpiringSoon: z.number().min(0),
  expiredDocuments: z.number().min(0),
  complianceRate: z.number().min(0).max(100),
});