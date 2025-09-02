/**
 * Document Management Service
 * 
 * Handles document upload, storage, retrieval, and lifecycle management.
 * Integrates with storage adapters for flexible file storage (local/S3).
 * Supports role-based access control and audit logging.
 * 
 * Features:
 * - Document upload with metadata
 * - Role-based access control (HR/ADMIN vs MEMBER)
 * - File storage abstraction (local dev / S3 prod)
 * - Signed URL generation for secure access
 * - Document expiry tracking
 * - Soft deletes with audit trail
 * - Export functionality
 */

import prisma from '../utils/config/db';
import { storageAdapter, UploadedFile } from '../adapters/storage';
import { 
  NotFoundError, 
  AuthorizationError, 
  ValidationError,
  InternalServerError 
} from '../utils/error/error';
import { DocumentType, Role } from '../../generated/prisma';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Import the proper type from validation
import type { UpdateDocumentRequest } from '../modules/document/validation/validation';

// Service interfaces
export interface CreateDocumentRequest {
  title: string;
  description?: string;
  type: DocumentType;
  employeeId?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface DocumentResponse {
  id: string;
  title: string;
  description?: string;
  type: DocumentType;
  fileName: string;
  fileSize: number;
  mimeType: string;
  metadata?: Record<string, any>;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  uploadedBy: {
    id: string;
    firstName: string;
    lastName?: string;
  };
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface DocumentWithDownloadUrl extends DocumentResponse {
  downloadUrl: string;
}

export interface ListDocumentsResponse {
  documents: DocumentResponse[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface DocumentFilters {
  type?: DocumentType;
  employeeId?: string;
  expiresAfter?: Date;
  expiresBefore?: Date;
  uploadedById?: string;
  page?: number;
  limit?: number;
}

/**
 * Document Management Service
 */
export class DocumentService {

  /**
   * Upload a new document with file and metadata
   */
  async uploadDocument(
    organizationId: string,
    uploadedById: string,
    uploaderRole: Role,
    file: UploadedFile,
    data: CreateDocumentRequest
  ): Promise<DocumentWithDownloadUrl> {
    // Authorization: Only HR and ADMIN can upload documents
    if (!['HR', 'ADMIN', 'SUPERADMIN'].includes(uploaderRole)) {
      throw new AuthorizationError('Only HR and ADMIN users can upload documents');
    }

    // Validate employee exists and belongs to same organization if specified
    if (data.employeeId) {
      const employee = await prisma.employee.findUnique({
        where: { id: data.employeeId },
        select: { id: true, organizationId: true, firstName: true, lastName: true }
      });

      if (!employee) {
        throw new NotFoundError('Employee not found');
      }

      if (employee.organizationId !== organizationId) {
        throw new AuthorizationError('Cannot assign documents to employees in other organizations');
      }
    }

    // Validate file
    this.validateFile(file);

    try {
      // Generate unique filename
      const fileExtension = path.extname(file.originalName);
      const uniqueFileName = `${uuidv4()}${fileExtension}`;

      // Upload file using storage adapter
      const storageResult = await storageAdapter.uploadFile(
        file,
        organizationId,
        uniqueFileName
      );

      // Create document record in database
      const document = await prisma.document.create({
        data: {
          title: data.title,
          description: data.description,
          type: data.type,
          fileUrl: storageResult.fileUrl,
          fileName: storageResult.fileName,
          fileSize: storageResult.fileSize,
          mimeType: storageResult.mimeType,
          metadata: data.metadata || undefined,
          expiresAt: data.expiresAt,
          uploadedById,
          organizationId,
          employeeId: data.employeeId,
        },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true }
          },
          employee: {
            select: { id: true, firstName: true, lastName: true }
          }
        }
      });

      // Generate download URL
      const downloadUrl = await storageAdapter.getDownloadUrl(document.fileUrl, {
        expiresIn: 300 // 5 minutes
      });

      console.log(`📄 Document uploaded: ${document.title} by ${document.uploadedBy.firstName}`);

      return this.formatDocumentWithUrl(document, downloadUrl);

    } catch (error) {
      console.error('❌ Document upload error:', error);
      
      if (error instanceof NotFoundError || 
          error instanceof AuthorizationError ||
          error instanceof ValidationError) {
        throw error;
      }
      
      throw new InternalServerError('Failed to upload document');
    }
  }

  /**
   * Get a document by ID with download URL
   */
  async getDocumentById(
    documentId: string,
    userId: string,
    userRole: Role,
    organizationId: string
  ): Promise<DocumentWithDownloadUrl> {
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        deletedAt: null, // Only non-deleted documents
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true }
        },
        employee: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Authorization: HR/ADMIN can see all, MEMBER can only see their own documents
    if (!['HR', 'ADMIN', 'SUPERADMIN'].includes(userRole)) {
      // Check if user is the associated employee
      const userEmployee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!userEmployee || document.employeeId !== userEmployee.id) {
        throw new AuthorizationError('You can only access documents assigned to you');
      }
    }

    // Generate download URL
    const downloadUrl = await storageAdapter.getDownloadUrl(document.fileUrl, {
      expiresIn: 300 // 5 minutes
    });

    return this.formatDocumentWithUrl(document, downloadUrl);
  }

  /**
   * List documents with filtering and pagination
   */
  async listDocuments(
    organizationId: string,
    userId: string,
    userRole: Role,
    filters: DocumentFilters = {}
  ): Promise<ListDocumentsResponse> {
    const { page = 1, limit = 20, ...otherFilters } = filters;
    const skip = (page - 1) * limit;

    // Build where clause based on role and filters
    const where: any = {
      organizationId,
      deletedAt: null,
    };

    // Role-based filtering
    if (!['HR', 'ADMIN', 'SUPERADMIN'].includes(userRole)) {
      // MEMBER can only see their own documents
      const userEmployee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (userEmployee) {
        where.employeeId = userEmployee.id;
      } else {
        // User has no employee record, return empty list
        return {
          documents: [],
          pagination: {
            total: 0,
            page,
            limit,
            totalPages: 0,
          }
        };
      }
    }

    // Apply filters
    if (otherFilters.type) {
      where.type = otherFilters.type;
    }

    if (otherFilters.employeeId) {
      where.employeeId = otherFilters.employeeId;
    }

    if (otherFilters.uploadedById) {
      where.uploadedById = otherFilters.uploadedById;
    }

    // Date range filters
    if (otherFilters.expiresAfter || otherFilters.expiresBefore) {
      where.expiresAt = {};
      if (otherFilters.expiresAfter) {
        where.expiresAt.gte = otherFilters.expiresAfter;
      }
      if (otherFilters.expiresBefore) {
        where.expiresAt.lte = otherFilters.expiresBefore;
      }
    }

    try {
      // Get total count for pagination
      const total = await prisma.document.count({ where });

      // Get documents with pagination
      const documents = await prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { createdAt: 'desc' }
        ],
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true }
          },
          employee: {
            select: { id: true, firstName: true, lastName: true }
          }
        }
      });

      const totalPages = Math.ceil(total / limit);

      return {
        documents: documents.map(doc => this.formatDocumentResponse(doc)),
        pagination: {
          total,
          page,
          limit,
          totalPages,
        }
      };

    } catch (error) {
      console.error('❌ List documents error:', error);
      throw new InternalServerError('Failed to retrieve documents');
    }
  }

  /**
   * Update document metadata (file cannot be changed)
   */
  async updateDocument(
    documentId: string,
    organizationId: string,
    userRole: Role,
    data: UpdateDocumentRequest
  ): Promise<DocumentResponse> {
    // Authorization: Only HR and ADMIN can update documents
    if (!['HR', 'ADMIN', 'SUPERADMIN'].includes(userRole)) {
      throw new AuthorizationError('Only HR and ADMIN users can update documents');
    }

    // Check document exists and belongs to organization
    const existingDocument = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        deletedAt: null,
      }
    });

    if (!existingDocument) {
      throw new NotFoundError('Document not found');
    }

    // Validate employee if being updated
    if (data.employeeId) {
      const employee = await prisma.employee.findUnique({
        where: { id: data.employeeId },
        select: { id: true, organizationId: true }
      });

      if (!employee) {
        throw new NotFoundError('Employee not found');
      }

      if (employee.organizationId !== organizationId) {
        throw new AuthorizationError('Cannot assign documents to employees in other organizations');
      }
    }

    try {
      const updatedDocument = await prisma.document.update({
        where: { id: documentId },
        data: {
          ...(data.title && { title: data.title }),
          ...(data.description !== undefined && { description: data.description || undefined }),
          ...(data.type && { type: data.type }),
          ...(data.employeeId !== undefined && { employeeId: data.employeeId || undefined }),
          ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt || undefined }),
          ...(data.metadata !== undefined && { metadata: data.metadata || undefined }),
          updatedAt: new Date(),
        },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true }
          },
          employee: {
            select: { id: true, firstName: true, lastName: true }
          }
        }
      });

      console.log(`📄 Document updated: ${updatedDocument.title}`);

      return this.formatDocumentResponse(updatedDocument);

    } catch (error) {
      console.error('❌ Update document error:', error);
      throw new InternalServerError('Failed to update document');
    }
  }

  /**
   * Soft delete a document
   */
  async deleteDocument(
    documentId: string,
    organizationId: string,
    userRole: Role
  ): Promise<{ success: boolean; message: string }> {
    // Authorization: Only HR and ADMIN can delete documents
    if (!['HR', 'ADMIN', 'SUPERADMIN'].includes(userRole)) {
      throw new AuthorizationError('Only HR and ADMIN users can delete documents');
    }

    // Check document exists and belongs to organization
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        deletedAt: null,
      }
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    try {
      // Soft delete (mark as deleted, don't remove file)
      await prisma.document.update({
        where: { id: documentId },
        data: {
          deletedAt: new Date(),
        }
      });

      console.log(`🗑️ Document soft deleted: ${document.title}`);

      return {
        success: true,
        message: 'Document deleted successfully',
      };

    } catch (error) {
      console.error('❌ Delete document error:', error);
      throw new InternalServerError('Failed to delete document');
    }
  }

  /**
   * Get user's own documents (for employees)
   */
  async getMyDocuments(
    userId: string,
    organizationId: string,
    filters: { type?: DocumentType; page?: number; limit?: number } = {}
  ): Promise<ListDocumentsResponse> {
    const { page = 1, limit = 20, type } = filters;

    // Get user's employee record
    const userEmployee = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!userEmployee) {
      // User is not an employee, return empty list
      return {
        documents: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        }
      };
    }

    // Use the standard list method with employee filter
    return this.listDocuments(
      organizationId,
      userId,
      'USER', // Force regular user permissions
      {
        employeeId: userEmployee.id,
        type,
        page,
        limit,
      }
    );
  }

  /**
   * Get documents expiring soon (for cron job)
   */
  async getExpiringDocuments(
    organizationId: string,
    daysAhead: number = 30
  ): Promise<DocumentResponse[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const currentDate = new Date();

    try {
      const documents = await prisma.document.findMany({
        where: {
          organizationId,
          deletedAt: null,
          expiresAt: {
            gte: currentDate,
            lte: futureDate,
          }
        },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true }
          },
          employee: {
            select: { id: true, firstName: true, lastName: true }
          }
        },
        orderBy: {
          expiresAt: 'asc'
        }
      });

      return documents.map(doc => this.formatDocumentResponse(doc));

    } catch (error) {
      console.error('❌ Get expiring documents error:', error);
      throw new InternalServerError('Failed to retrieve expiring documents');
    }
  }

  /**
   * Validate uploaded file
   */
  private validateFile(file: UploadedFile): void {
    const maxSize = 10 * 1024 * 1024; // 10MB
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

    if (file.size > maxSize) {
      throw new ValidationError('File size cannot exceed 10MB');
    }

    if (!allowedMimeTypes.includes(file.mimeType)) {
      throw new ValidationError('File type not supported');
    }

    if (!file.originalName || file.originalName.trim() === '') {
      throw new ValidationError('File name is required');
    }
  }

  /**
   * Format document response
   */
  private formatDocumentResponse(document: any): DocumentResponse {
    return {
      id: document.id,
      title: document.title,
      description: document.description,
      type: document.type,
      fileName: document.fileName,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      metadata: document.metadata,
      expiresAt: document.expiresAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      uploadedBy: {
        id: document.uploadedBy.id,
        firstName: document.uploadedBy.firstName,
        lastName: document.uploadedBy.lastName,
      },
      employee: document.employee ? {
        id: document.employee.id,
        firstName: document.employee.firstName,
        lastName: document.employee.lastName,
      } : undefined,
    };
  }

  /**
   * Format document response with download URL
   */
  private formatDocumentWithUrl(document: any, downloadUrl: string): DocumentWithDownloadUrl {
    return {
      ...this.formatDocumentResponse(document),
      downloadUrl,
    };
  }
}

// Export singleton instance
export const documentService = new DocumentService();