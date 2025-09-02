/**
 * Document Router
 * 
 * Defines API routes for document management operations.
 * Implements role-based access control and request validation.
 * 
 * Routes:
 * - POST /documents - Upload document (HR/ADMIN only)
 * - GET /documents - List documents with filters
 * - GET /documents/:id - Get document with download URL
 * - PUT /documents/:id - Update document metadata (HR/ADMIN only)
 * - DELETE /documents/:id - Soft delete document (HR/ADMIN only)
 * - GET /my-documents - Get user's assigned documents
 * - GET /documents/export - Export documents as zip (HR/ADMIN only)
 */

import { Router } from 'express';
import { validateRequest } from '../../utils/validation/validateRequest';
import {
  uploadDocumentController,
  listDocumentsController,
  getDocumentController,
  updateDocumentController,
  deleteDocumentController,
  getMyDocumentsController,
  exportDocumentsController,
} from './document.controller';
import {
  uploadDocumentSchema,
  updateDocumentSchema,
  documentIdSchema,
  listDocumentsQuerySchema,
  myDocumentsQuerySchema,
  exportDocumentsQuerySchema,
} from './validation/validation';
import {
  authenticateToken,
  requireRole,
} from '../auth/middleware/auth.middleware';

const documentRouter = Router();

// Validation middleware
const validateUploadDocument = validateRequest({ 
  body: uploadDocumentSchema 
});
const validateUpdateDocument = validateRequest({ 
  body: updateDocumentSchema 
});
const validateDocumentId = validateRequest({ 
  params: documentIdSchema 
});
const validateListQuery = validateRequest({ 
  query: listDocumentsQuerySchema 
});
const validateMyDocumentsQuery = validateRequest({ 
  query: myDocumentsQuerySchema 
});
const validateExportQuery = validateRequest({ 
  query: exportDocumentsQuerySchema 
});

// Role-based middleware
const requireHROrAdmin = requireRole('HR', 'ADMIN', 'SUPERADMIN');

/**
 * POST /documents
 * Upload a new document with file and metadata
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Valid multipart form data with file and metadata
 * - File validation (size, type)
 */
documentRouter.post(
  '/',
  authenticateToken,              // Verify JWT and populate req.user
  requireHROrAdmin,               // Only HR and ADMIN can upload documents
  validateUploadDocument,         // Validate request body metadata
  uploadDocumentController        // Handle file upload (includes multer middleware)
);

/**
 * GET /documents
 * List documents with filtering and pagination
 * Requires:
 * - Authentication (JWT token)
 * - Optional query parameters (page, limit, type, employeeId, etc.)
 * 
 * Access control:
 * - HR/ADMIN: Can see all organization documents
 * - MEMBER: Can only see documents assigned to them
 */
documentRouter.get(
  '/',
  authenticateToken,              // Verify JWT and populate req.user
  validateListQuery,              // Validate query parameters
  listDocumentsController
);

/**
 * GET /documents/export
 * Export documents as zip file with metadata
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Optional filter parameters
 * 
 * Note: This route must come BEFORE /documents/:id to avoid conflicts
 */
documentRouter.get(
  '/export',
  authenticateToken,              // Verify JWT and populate req.user
  requireHROrAdmin,               // Only HR and ADMIN can export documents
  validateExportQuery,            // Validate export parameters
  exportDocumentsController
);

/**
 * GET /documents/:id
 * Get document metadata and download URL
 * Requires:
 * - Authentication (JWT token)
 * - Valid document ID (UUID)
 * 
 * Access control:
 * - HR/ADMIN: Can access any organization document
 * - MEMBER: Can only access documents assigned to them
 */
documentRouter.get(
  '/:id',
  authenticateToken,              // Verify JWT and populate req.user
  validateDocumentId,             // Validate document ID parameter
  getDocumentController
);

/**
 * PUT /documents/:id
 * Update document metadata (file cannot be changed)
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Valid document ID (UUID)
 * - Valid request body with partial document data
 */
documentRouter.put(
  '/:id',
  authenticateToken,              // Verify JWT and populate req.user
  requireHROrAdmin,               // Only HR and ADMIN can update documents
  validateDocumentId,             // Validate document ID parameter
  validateUpdateDocument,         // Validate request body
  updateDocumentController
);

/**
 * DELETE /documents/:id
 * Soft delete a document (preserves audit trail)
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Valid document ID (UUID)
 */
documentRouter.delete(
  '/:id',
  authenticateToken,              // Verify JWT and populate req.user
  requireHROrAdmin,               // Only HR and ADMIN can delete documents
  validateDocumentId,             // Validate document ID parameter
  deleteDocumentController
);

/**
 * GET /my-documents
 * Get documents assigned to the authenticated user
 * Requires:
 * - Authentication (JWT token)
 * - Optional query parameters (page, limit, type)
 * 
 * This endpoint allows regular employees to view documents
 * assigned to them without needing HR/ADMIN permissions
 */
documentRouter.get(
  '/my-documents',
  authenticateToken,              // Verify JWT and populate req.user
  validateMyDocumentsQuery,       // Validate query parameters
  getMyDocumentsController
);

export default documentRouter;