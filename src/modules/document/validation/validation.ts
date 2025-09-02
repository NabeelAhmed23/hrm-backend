/**
 * Document Validation Schemas
 * 
 * Zod schemas for validating document-related API requests.
 * Includes validation for upload, update, listing, and filtering operations.
 */

import { z } from 'zod';
import { DocumentType } from '../../../../generated/prisma';

/**
 * Schema for document upload metadata
 */
export const uploadDocumentSchema = z.object({
  title: z
    .string()
    .min(1, 'Document title is required')
    .max(200, 'Document title cannot exceed 200 characters')
    .trim(),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .trim()
    .optional(),
  type: z.nativeEnum(DocumentType),
  employeeId: z
    .string()
    .uuid('Employee ID must be a valid UUID')
    .optional(),
  expiresAt: z
    .string()
    .datetime('Expiry date must be a valid ISO datetime')
    .transform((val) => new Date(val))
    .refine((date) => date > new Date(), 'Expiry date must be in the future')
    .optional(),
  metadata: z
    .record(z.string(), z.any())
    .optional(),
});

/**
 * Schema for document update (partial fields allowed)
 */
export const updateDocumentSchema = z.object({
  title: z
    .string()
    .min(1, 'Document title is required')
    .max(200, 'Document title cannot exceed 200 characters')
    .trim()
    .optional(),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .trim()
    .optional()
    .nullable(), // Allow null to clear description
  type: z.nativeEnum(DocumentType).optional(),
  employeeId: z
    .string()
    .uuid('Employee ID must be a valid UUID')
    .optional()
    .nullable(), // Allow null to unassign from employee
  expiresAt: z
    .string()
    .datetime('Expiry date must be a valid ISO datetime')
    .transform((val) => new Date(val))
    .refine((date) => date > new Date(), 'Expiry date must be in the future')
    .optional()
    .nullable(), // Allow null to remove expiry
  metadata: z
    .record(z.string(), z.any())
    .optional()
    .nullable(), // Allow null to clear metadata
});

/**
 * Schema for document ID parameter validation
 */
export const documentIdSchema = z.object({
  id: z
    .string()
    .uuid('Document ID must be a valid UUID'),
});

/**
 * Schema for listing documents with filters
 */
export const listDocumentsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 1)
    .refine((val) => val > 0, 'Page must be greater than 0'),
  limit: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 20)
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
  type: z
    .string()
    .optional()
    .refine(
      (val) => !val || Object.values(DocumentType).includes(val as DocumentType),
      'Invalid document type filter'
    )
    .transform((val) => val as DocumentType | undefined),
  employeeId: z
    .string()
    .uuid('Employee ID must be a valid UUID')
    .optional(),
  uploadedById: z
    .string()
    .uuid('Uploaded by ID must be a valid UUID')
    .optional(),
  expiresAfter: z
    .string()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
    .refine(
      (date) => !date || !isNaN(date.getTime()),
      'Expires after must be a valid ISO date string'
    ),
  expiresBefore: z
    .string()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
    .refine(
      (date) => !date || !isNaN(date.getTime()),
      'Expires before must be a valid ISO date string'
    ),
});

/**
 * Schema for my documents query (simplified)
 */
export const myDocumentsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 1)
    .refine((val) => val > 0, 'Page must be greater than 0'),
  limit: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 20)
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
  type: z
    .string()
    .optional()
    .refine(
      (val) => !val || Object.values(DocumentType).includes(val as DocumentType),
      'Invalid document type filter'
    )
    .transform((val) => val as DocumentType | undefined),
});

/**
 * Schema for document export filters
 */
export const exportDocumentsQuerySchema = z.object({
  type: z
    .string()
    .optional()
    .refine(
      (val) => !val || Object.values(DocumentType).includes(val as DocumentType),
      'Invalid document type filter'
    )
    .transform((val) => val as DocumentType | undefined),
  employeeId: z
    .string()
    .uuid('Employee ID must be a valid UUID')
    .optional(),
  uploadedById: z
    .string()
    .uuid('Uploaded by ID must be a valid UUID')
    .optional(),
  expiresAfter: z
    .string()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
    .refine(
      (date) => !date || !isNaN(date.getTime()),
      'Expires after must be a valid ISO date string'
    ),
  expiresBefore: z
    .string()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
    .refine(
      (date) => !date || !isNaN(date.getTime()),
      'Expires before must be a valid ISO date string'
    ),
  format: z
    .enum(['zip', 'json'])
    .default('zip'),
});

/**
 * File upload validation schema (for multipart form data)
 */
export const fileUploadSchema = z.object({
  fieldname: z.string(),
  originalname: z.string().min(1, 'File name is required'),
  encoding: z.string(),
  mimetype: z.string().refine(
    (mime) => [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(mime),
    'File type not supported'
  ),
  size: z.number().max(10 * 1024 * 1024, 'File size cannot exceed 10MB'),
  buffer: z.instanceof(Buffer),
});

// Type inference from schemas
export type UploadDocumentRequest = z.infer<typeof uploadDocumentSchema>;
export type UpdateDocumentRequest = z.infer<typeof updateDocumentSchema>;
export type DocumentIdParams = z.infer<typeof documentIdSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
export type MyDocumentsQuery = z.infer<typeof myDocumentsQuerySchema>;
export type ExportDocumentsQuery = z.infer<typeof exportDocumentsQuerySchema>;
export type FileUpload = z.infer<typeof fileUploadSchema>;

// Validation functions for different document metadata types
export const contractMetadataSchema = z.object({
  contractNumber: z.string().optional(),
  counterparty: z.string().optional(),
  value: z.number().optional(),
  currency: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const licenseMetadataSchema = z.object({
  licenseNumber: z.string().optional(),
  issuingAuthority: z.string().optional(),
  jurisdiction: z.string().optional(),
  renewalRequired: z.boolean().optional(),
  nextRenewalDate: z.string().datetime().optional(),
});

export const certificationMetadataSchema = z.object({
  certificationBody: z.string().optional(),
  certificateNumber: z.string().optional(),
  level: z.string().optional(),
  validUntil: z.string().datetime().optional(),
  renewalRequired: z.boolean().optional(),
});

export const policyMetadataSchema = z.object({
  policyNumber: z.string().optional(),
  version: z.string().optional(),
  approvedBy: z.string().optional(),
  effectiveDate: z.string().datetime().optional(),
  reviewDate: z.string().datetime().optional(),
});

// Type inference for metadata schemas
export type ContractMetadata = z.infer<typeof contractMetadataSchema>;
export type LicenseMetadata = z.infer<typeof licenseMetadataSchema>;
export type CertificationMetadata = z.infer<typeof certificationMetadataSchema>;
export type PolicyMetadata = z.infer<typeof policyMetadataSchema>;