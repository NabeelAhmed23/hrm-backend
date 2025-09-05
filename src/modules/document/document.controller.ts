/**
 * Document Controller
 * 
 * Handles HTTP requests for document management operations.
 * Integrates with DocumentService for business logic and storage operations.
 * Provides role-based access control and comprehensive error handling.
 * 
 * Endpoints:
 * - POST /documents - Upload document
 * - GET /documents - List documents with filters
 * - GET /documents/:id - Get document with download URL
 * - PUT /documents/:id - Update document metadata
 * - DELETE /documents/:id - Soft delete document
 * - GET /my-documents - Get user's assigned documents
 * - GET /documents/export - Export documents as zip
 */

import { Request, Response } from 'express';
import multer from 'multer';
import {
  UploadDocumentRequest,
  UpdateDocumentRequest,
  DocumentIdParams,
  ListDocumentsQuery,
  MyDocumentsQuery,
  ExportDocumentsQuery,
} from './validation/validation';
import { documentService } from '../../services/documentService';
import { documentExportService } from '../../services/documentExportService';
import { isAppError } from '../../utils/error/error';
import { Role, DocumentType } from '../../../generated/prisma';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported'));
    }
  },
});

/**
 * POST /documents
 * Upload a new document with metadata
 * 
 * Features:
 * - File upload with validation
 * - Role-based authorization (HR/ADMIN only)
 * - Metadata validation
 * - Storage abstraction (local/S3)
 * - Automatic URL generation
 */
export const uploadDocumentController = [
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'File is required',
        });
        return;
      }

      // Extract authenticated user data
      const user = req.user!;
      const { userId, orgId, role } = user;

      // Extract and validate FormData payload from req.body
      const formData = {
        title: req.body.title?.trim(),
        description: req.body.description?.trim(),
        type: req.body.type,
        employeeId: req.body.employeeId || undefined,
        expiresAt: req.body.expiresAt || undefined,
        metadata: req.body.metadata ? JSON.parse(req.body.metadata) : undefined,
      };

      // Basic validation for required fields
      if (!formData.title || formData.title.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Document title is required',
        });
        return;
      }

      if (formData.title.length > 200) {
        res.status(400).json({
          success: false,
          message: 'Document title cannot exceed 200 characters',
        });
        return;
      }

      if (!formData.type) {
        res.status(400).json({
          success: false,
          message: 'Document type is required',
        });
        return;
      }

      // Validate document type enum
      if (!Object.values(DocumentType).includes(formData.type as DocumentType)) {
        res.status(400).json({
          success: false,
          message: 'Invalid document type',
        });
        return;
      }

      if (formData.description && formData.description.length > 1000) {
        res.status(400).json({
          success: false,
          message: 'Description cannot exceed 1000 characters',
        });
        return;
      }

      // Validate employee ID format if provided
      if (formData.employeeId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(formData.employeeId)) {
          res.status(400).json({
            success: false,
            message: 'Employee ID must be a valid UUID',
          });
          return;
        }
      }

      // Validate metadata JSON format if provided
      if (req.body.metadata) {
        try {
          JSON.parse(req.body.metadata);
        } catch (error) {
          res.status(400).json({
            success: false,
            message: 'Invalid metadata JSON format',
          });
          return;
        }
      }

      if (formData.expiresAt) {
        const expiryDate = new Date(formData.expiresAt);
        if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
          res.status(400).json({
            success: false,
            message: 'Expiry date must be a valid future date',
          });
          return;
        }
        formData.expiresAt = expiryDate.toISOString();
      }

      const validatedData = formData as UploadDocumentRequest;

      // Prepare file object for service
      const uploadedFile = {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      };

      // Upload document using service
      const result = await documentService.uploadDocument(
        orgId,
        userId,
        role as Role,
        uploadedFile,
        validatedData
      );

      // Send success response
      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        data: result,
      });

    } catch (error) {
      console.error('❌ Upload document controller error:', error);

      // Handle multer errors
      if (error && typeof error === 'object' && 'code' in error) {
        if ((error as any).code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            success: false,
            message: 'File size cannot exceed 10MB',
          });
        } else {
          res.status(400).json({
            success: false,
            message: 'File upload error: ' + (error as any).message,
          });
        }
        return;
      }

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
        message: 'Internal server error',
      });
    }
  }
];

/**
 * GET /documents
 * List documents with filtering and pagination
 * 
 * Features:
 * - Role-based document access
 * - Advanced filtering options
 * - Pagination support
 * - Organization boundary enforcement
 */
export async function listDocumentsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { userId, orgId, role } = user;

    // Query parameters are validated by middleware
    const query = req.validated.query as ListDocumentsQuery;

    // List documents using service
    const result = await documentService.listDocuments(
      orgId,
      userId,
      role as Role,
      {
        page: query.page,
        limit: query.limit,
        type: query.type,
        employeeId: query.employeeId,
        uploadedById: query.uploadedById,
        expiresAfter: query.expiresAfter,
        expiresBefore: query.expiresBefore,
      }
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: 'Documents retrieved successfully',
      data: result,
    });

  } catch (error) {
    console.error('❌ List documents controller error:', error);

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
      message: 'Internal server error',
    });
  }
}

/**
 * GET /documents/:id
 * Get document metadata and download URL
 * 
 * Features:
 * - Role-based access control
 * - Signed URL generation
 * - Organization boundary enforcement
 * - Document ownership validation
 */
export async function getDocumentController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { userId, orgId, role } = user;

    // Route parameters are validated by middleware
    const params = req.validated.params as DocumentIdParams;
    const documentId = params.id;

    // Get document using service
    const result = await documentService.getDocumentById(
      documentId,
      userId,
      role as Role,
      orgId
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: 'Document retrieved successfully',
      data: result,
    });

  } catch (error) {
    console.error('❌ Get document controller error:', error);

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
      message: 'Internal server error',
    });
  }
}

/**
 * PUT /documents/:id
 * Update document metadata (file cannot be changed)
 * 
 * Features:
 * - Role-based authorization (HR/ADMIN only)
 * - Partial updates support
 * - Metadata validation
 * - Employee assignment validation
 */
export async function updateDocumentController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { orgId, role } = user;

    // Route parameters are validated by middleware
    const params = req.validated.params as DocumentIdParams;
    const documentId = params.id;

    // Request body is validated by middleware
    const validatedData = req.validated.body as UpdateDocumentRequest;

    // Update document using service
    const result = await documentService.updateDocument(
      documentId,
      orgId,
      role as Role,
      validatedData
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: 'Document updated successfully',
      data: result,
    });

  } catch (error) {
    console.error('❌ Update document controller error:', error);

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
      message: 'Internal server error',
    });
  }
}

/**
 * DELETE /documents/:id
 * Soft delete a document
 * 
 * Features:
 * - Role-based authorization (HR/ADMIN only)
 * - Soft delete (preserves audit trail)
 * - Organization boundary enforcement
 * - Document ownership validation
 */
export async function deleteDocumentController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { orgId, role } = user;

    // Route parameters are validated by middleware
    const params = req.validated.params as DocumentIdParams;
    const documentId = params.id;

    // Delete document using service
    const result = await documentService.deleteDocument(
      documentId,
      orgId,
      role as Role
    );

    // Send success response
    res.status(200).json({
      success: result.success,
      message: result.message,
    });

  } catch (error) {
    console.error('❌ Delete document controller error:', error);

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
      message: 'Internal server error',
    });
  }
}

/**
 * GET /my-documents
 * Get documents assigned to the authenticated user (employee view)
 * 
 * Features:
 * - Employee-specific document access
 * - Simplified filtering
 * - Pagination support
 * - Direct file access for assigned documents
 */
export async function getMyDocumentsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { userId, orgId } = user;

    // Query parameters are validated by middleware
    const query = req.validated.query as MyDocumentsQuery;

    // Get user's documents using service
    const result = await documentService.getMyDocuments(
      userId,
      orgId,
      {
        type: query.type,
        page: query.page,
        limit: query.limit,
      }
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: 'Your documents retrieved successfully',
      data: result,
    });

  } catch (error) {
    console.error('❌ Get my documents controller error:', error);

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
      message: 'Internal server error',
    });
  }
}

/**
 * GET /documents/export
 * Export documents as zip file with metadata index
 * 
 * Features:
 * - Role-based authorization (HR/ADMIN only)
 * - Document filtering support
 * - Zip file generation with metadata
 * - Progress tracking and error handling
 * - Secure file access through storage adapter
 */
export async function exportDocumentsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { userId, orgId, role, firstName, lastName } = user;

    // Query parameters are validated by middleware
    const query = req.validated.query as ExportDocumentsQuery;

    // Build filter object
    const filters = {
      type: query.type,
      employeeId: query.employeeId,
      uploadedById: query.uploadedById,
      expiresAfter: query.expiresAfter,
      expiresBefore: query.expiresBefore,
    };

    // Generate export
    const exportedBy = `${firstName} ${lastName || ''}`.trim();
    
    console.log(`📦 Starting document export for ${exportedBy}`);
    
    const result = await documentExportService.exportDocuments(
      orgId,
      userId,
      role as Role,
      filters,
      exportedBy
    );

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('Content-Length', result.zipBuffer.length);

    // Send the zip file
    res.send(result.zipBuffer);

    console.log(`📦 Export completed and sent: ${result.fileName}`);

  } catch (error) {
    console.error('❌ Export documents controller error:', error);

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
      message: 'Internal server error',
    });
  }
}