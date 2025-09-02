/**
 * Local Storage Adapter
 * 
 * Handles file storage in local development environment.
 * Files are saved to public/uploads/ directory and served via Express static middleware.
 * 
 * Features:
 * - Direct file system operations
 * - Public URL generation
 * - Organization-based folder structure
 * - No signed URLs needed (direct access)
 */

import fs from 'fs/promises';
import path from 'path';
import { 
  StorageAdapter, 
  UploadedFile, 
  StorageResult, 
  DownloadUrlOptions 
} from './storageAdapter';
import { InternalServerError } from '../../utils/error/error';

export class LocalStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;
  private readonly publicUrl: string;

  constructor() {
    // Base directory for file uploads
    this.baseDir = path.join(process.cwd(), 'public', 'uploads');
    
    // Public URL base (served by Express static middleware)
    this.publicUrl = process.env.APP_URL || 'http://localhost:3005';
    
    // Ensure upload directory exists
    this.ensureUploadDirectory();
  }

  /**
   * Create upload directory if it doesn't exist
   */
  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.access(this.baseDir);
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(this.baseDir, { recursive: true });
      console.log(`📁 Created uploads directory: ${this.baseDir}`);
    }
  }

  /**
   * Get organization-specific upload path
   */
  private getOrgPath(organizationId: string): string {
    return path.join(this.baseDir, organizationId);
  }

  /**
   * Ensure organization directory exists
   */
  private async ensureOrgDirectory(organizationId: string): Promise<void> {
    const orgPath = this.getOrgPath(organizationId);
    try {
      await fs.access(orgPath);
    } catch {
      await fs.mkdir(orgPath, { recursive: true });
      console.log(`📁 Created org directory: ${orgPath}`);
    }
  }

  /**
   * Upload file to local storage
   */
  async uploadFile(
    file: UploadedFile,
    organizationId: string,
    fileName: string
  ): Promise<StorageResult> {
    try {
      // Ensure organization directory exists
      await this.ensureOrgDirectory(organizationId);

      // Build file path
      const orgPath = this.getOrgPath(organizationId);
      const filePath = path.join(orgPath, fileName);
      
      // Write file to disk
      await fs.writeFile(filePath, file.buffer);

      // Generate relative path for storage in DB
      const relativePath = path.join('uploads', organizationId, fileName);
      
      // Generate public URL
      const fileUrl = `${this.publicUrl}/${relativePath.replace(/\\\\/g, '/')}`;

      console.log(`📁 File uploaded locally: ${filePath}`);

      return {
        fileUrl: relativePath, // Store relative path in DB
        fileName,
        fileSize: file.size,
        mimeType: file.mimeType,
      };

    } catch (error) {
      console.error('❌ Local file upload error:', error);
      throw new InternalServerError('Failed to upload file to local storage');
    }
  }

  /**
   * Generate download URL (direct public URL for local files)
   */
  async getDownloadUrl(
    fileUrl: string,
    options?: DownloadUrlOptions
  ): Promise<string> {
    // For local storage, return direct public URL
    // fileUrl should be relative path like 'uploads/org-id/filename.pdf'
    if (fileUrl.startsWith('http')) {
      // Already a full URL
      return fileUrl;
    }

    // Convert relative path to full public URL
    const publicUrl = `${this.publicUrl}/${fileUrl.replace(/\\\\/g, '/')}`;
    
    // Note: options.expiresIn is ignored for local storage
    // since we serve files directly through Express static
    
    return publicUrl;
  }

  /**
   * Delete file from local storage
   */
  async deleteFile(fileUrl: string): Promise<boolean> {
    try {
      // Convert URL back to file path
      let filePath: string;
      
      if (fileUrl.startsWith('http')) {
        // Extract path from full URL
        const url = new URL(fileUrl);
        filePath = path.join(process.cwd(), 'public', url.pathname);
      } else {
        // Relative path
        filePath = path.join(process.cwd(), 'public', fileUrl);
      }

      // Check if file exists
      await fs.access(filePath);
      
      // Delete file
      await fs.unlink(filePath);
      
      console.log(`🗑️ File deleted from local storage: ${filePath}`);
      return true;

    } catch (error) {
      console.error('❌ Error deleting local file:', error);
      return false;
    }
  }

  /**
   * Check if file exists in local storage
   */
  async fileExists(fileUrl: string): Promise<boolean> {
    try {
      // Convert URL back to file path
      let filePath: string;
      
      if (fileUrl.startsWith('http')) {
        const url = new URL(fileUrl);
        filePath = path.join(process.cwd(), 'public', url.pathname);
      } else {
        filePath = path.join(process.cwd(), 'public', fileUrl);
      }

      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata from local storage
   */
  async getFileMetadata(fileUrl: string): Promise<{
    size: number;
    lastModified: Date;
    mimeType?: string;
  }> {
    try {
      // Convert URL back to file path
      let filePath: string;
      
      if (fileUrl.startsWith('http')) {
        const url = new URL(fileUrl);
        filePath = path.join(process.cwd(), 'public', url.pathname);
      } else {
        filePath = path.join(process.cwd(), 'public', fileUrl);
      }

      const stats = await fs.stat(filePath);
      
      return {
        size: stats.size,
        lastModified: stats.mtime,
        mimeType: undefined, // Would need to infer from extension or store separately
      };

    } catch (error) {
      console.error('❌ Error getting file metadata:', error);
      throw new InternalServerError('Failed to get file metadata');
    }
  }
}