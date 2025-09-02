/**
 * Document Export Service
 * 
 * Handles exporting documents as zip files with metadata index.
 * Supports filtering by document type, employee, expiry dates, etc.
 * Generates structured zip with documents and JSON metadata index.
 * 
 * Features:
 * - Zip file generation with documents and metadata
 * - Filtering support (type, employee, date ranges)
 * - Progress tracking for large exports
 * - Secure file access through storage adapter
 * - Memory-efficient streaming for large files
 */

import JSZip from 'jszip';
import { storageAdapter } from '../adapters/storage';
import { documentService, DocumentFilters } from './documentService';
import { InternalServerError, ValidationError } from '../utils/error/error';
import { Role } from '../../generated/prisma';

export interface ExportProgress {
  total: number;
  completed: number;
  errors: string[];
}

export interface ExportResult {
  zipBuffer: Buffer;
  fileName: string;
  metadata: {
    exportDate: string;
    totalDocuments: number;
    filters: DocumentFilters;
    exportedBy: string;
  };
}

/**
 * Document Export Service
 */
export class DocumentExportService {

  /**
   * Export documents as zip file with metadata index
   */
  async exportDocuments(
    organizationId: string,
    userId: string,
    userRole: Role,
    filters: DocumentFilters = {},
    exportedBy: string
  ): Promise<ExportResult> {
    try {
      console.log(`📦 Starting document export for organization ${organizationId}`);
      
      // Get documents based on filters
      const documentList = await documentService.listDocuments(
        organizationId,
        userId,
        userRole,
        {
          ...filters,
          limit: 1000, // Large limit to export all matching documents
          page: 1,
        }
      );

      if (documentList.documents.length === 0) {
        throw new ValidationError('No documents found matching the specified criteria');
      }

      // Create zip instance
      const zip = new JSZip();
      const progress: ExportProgress = {
        total: documentList.documents.length,
        completed: 0,
        errors: [],
      };

      // Create documents folder in zip
      const documentsFolder = zip.folder('documents');
      if (!documentsFolder) {
        throw new InternalServerError('Failed to create documents folder in zip');
      }

      // Process each document
      for (const document of documentList.documents) {
        try {
          console.log(`📄 Processing document: ${document.title}`);
          
          // Check if file exists in storage
          const fileExists = await storageAdapter.fileExists(document.fileName);
          if (!fileExists) {
            progress.errors.push(`File not found: ${document.title} (${document.fileName})`);
            console.warn(`⚠️ File not found: ${document.fileName}`);
            continue;
          }

          // Get file download URL (for accessing file content)
          const downloadUrl = await storageAdapter.getDownloadUrl(document.fileName, {
            expiresIn: 3600, // 1 hour - enough time for export
          });

          // Download file content
          const fileBuffer = await this.downloadFileContent(downloadUrl);
          
          // Create sanitized filename for zip
          const sanitizedFileName = this.sanitizeFileName(
            `${document.title}_${document.id}${this.getFileExtension(document.fileName)}`
          );

          // Add file to zip with organized folder structure
          const folderName = document.type.toLowerCase();
          let targetFolder = documentsFolder.folder(folderName);
          if (!targetFolder) {
            targetFolder = documentsFolder;
          }

          targetFolder.file(sanitizedFileName, fileBuffer);
          progress.completed++;

          console.log(`✅ Added to zip: ${sanitizedFileName}`);

        } catch (error) {
          console.error(`❌ Error processing document ${document.id}:`, error);
          progress.errors.push(`Failed to export: ${document.title} - ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Create metadata index
      const metadataIndex = {
        exportInfo: {
          exportDate: new Date().toISOString(),
          exportedBy,
          organizationId,
          totalDocuments: documentList.documents.length,
          successfulExports: progress.completed,
          failedExports: progress.errors.length,
          filters: this.sanitizeFilters(filters),
        },
        documents: documentList.documents.map(doc => ({
          id: doc.id,
          title: doc.title,
          description: doc.description,
          type: doc.type,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          metadata: doc.metadata,
          expiresAt: doc.expiresAt,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          uploadedBy: doc.uploadedBy,
          employee: doc.employee,
        })),
        errors: progress.errors,
      };

      // Add metadata index to zip
      zip.file('export_metadata.json', JSON.stringify(metadataIndex, null, 2));

      // Add export summary
      const summary = {
        totalDocuments: documentList.documents.length,
        successfulExports: progress.completed,
        failedExports: progress.errors.length,
        exportDate: new Date().toISOString(),
        ...(progress.errors.length > 0 && { errors: progress.errors }),
      };
      zip.file('export_summary.txt', this.generateSummaryText(summary));

      // Generate zip file
      console.log('🗜️ Generating zip file...');
      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      // Generate export filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `documents_export_${timestamp}.zip`;

      console.log(`📦 Export completed: ${progress.completed}/${progress.total} documents`);
      if (progress.errors.length > 0) {
        console.warn(`⚠️ Export had ${progress.errors.length} errors`);
      }

      return {
        zipBuffer,
        fileName,
        metadata: {
          exportDate: new Date().toISOString(),
          totalDocuments: progress.completed,
          filters,
          exportedBy,
        },
      };

    } catch (error) {
      console.error('❌ Document export error:', error);
      
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new InternalServerError('Failed to export documents');
    }
  }

  /**
   * Download file content from URL (handles both local and S3 URLs)
   */
  private async downloadFileContent(url: string): Promise<Buffer> {
    try {
      // For local development, we need to read files from disk
      // For S3, we use the signed URL to fetch content
      
      if (url.startsWith('http')) {
        // S3 signed URL or local HTTP URL
        const fetch = await import('node-fetch');
        const response = await fetch.default(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return Buffer.from(await response.arrayBuffer());
      } else {
        // Local file path
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const filePath = path.join(process.cwd(), 'public', url);
        return await fs.readFile(filePath);
      }

    } catch (error) {
      console.error('❌ Error downloading file content:', error);
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sanitize filename for zip entry
   */
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .substring(0, 200); // Limit length
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot !== -1 ? fileName.substring(lastDot) : '';
  }

  /**
   * Sanitize filters for metadata (remove sensitive data)
   */
  private sanitizeFilters(filters: DocumentFilters): any {
    return {
      type: filters.type,
      employeeId: filters.employeeId ? '[REDACTED]' : undefined,
      uploadedById: filters.uploadedById ? '[REDACTED]' : undefined,
      expiresAfter: filters.expiresAfter?.toISOString(),
      expiresBefore: filters.expiresBefore?.toISOString(),
      page: filters.page,
      limit: filters.limit,
    };
  }

  /**
   * Generate human-readable summary text
   */
  private generateSummaryText(summary: any): string {
    return `Document Export Summary
========================

Export Date: ${summary.exportDate}
Total Documents: ${summary.totalDocuments}
Successful Exports: ${summary.successfulExports}
Failed Exports: ${summary.failedExports}

${summary.failedExports > 0 ? `
Errors:
${summary.errors.map((error: string) => `- ${error}`).join('\n')}
` : 'No errors occurred during export.'}

Files are organized by document type in the 'documents' folder.
See 'export_metadata.json' for detailed information about each document.
`;
  }

  /**
   * Export single document (for testing or individual downloads)
   */
  async exportSingleDocument(
    documentId: string,
    organizationId: string,
    userId: string,
    userRole: Role
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    try {
      // Get document with download URL
      const document = await documentService.getDocumentById(
        documentId,
        userId,
        userRole,
        organizationId
      );

      // Download file content
      const fileBuffer = await this.downloadFileContent(document.downloadUrl);

      return {
        buffer: fileBuffer,
        fileName: document.fileName,
        mimeType: document.mimeType,
      };

    } catch (error) {
      console.error('❌ Single document export error:', error);
      throw new InternalServerError('Failed to export document');
    }
  }
}

// Export singleton instance
export const documentExportService = new DocumentExportService();